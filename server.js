//#region global variable declarations
const express = require ('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const {Server} = require ("socket.io");
const io = new Server(server);
const platformclient =  require ('purecloud-platform-client-v2');
const apiclient = platformclient.ApiClient.instance;
const cryptomodule = require ('crypto')
const localtunnel = require ('localtunnel');
const readline = require('readline');
const { program } = require('commander');
require('dotenv').config();

const openmessagingintegrationid = process.env.INTEGRATION_ID;


var conversationapi;
var senderid = cryptomodule.randomUUID();
var connectiondictionary = {};
var convid = false;
var conversationid;
var messagingid;
var debug = false;
var tunnel = null;
var simulatefailures =  false;
var localtunnelused = false;
var currenturl = "https://cute-lions-act.loca.lt/openmessagingwebhook";
var rejectcode = 403;

//#endregion

//#region web server handling
app.use(express.json());


app.get('/', (req,res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/openmessagingwebhook', (req,res) => {

   // Logger("RECV","new webhook message received...");

    if (debug){
        Logger("RECV", "Webhook message headers " + JSON.stringify(req.headers, null, 2));
    }

 
    // integration - the integration object
    // normalizedMessage - the NormalizedMessage payload
    // request - webhook request object

    const jsonrequestbody = JSON.stringify(req.body);
    const signature = req.headers['x-hub-signature-256'];
    const messageHash = cryptomodule.createHmac('sha256',  process.env.INTEGRATION_SECRET)
     .update(jsonrequestbody)
     .digest('base64');

    // console.log(`sha256=${messageHash}`);
    // console.log(signature);
   
    if (`sha256=${messageHash}` !== signature) {
         //throw new Error("Webhook Validation Failed! Throw this away.");
         Logger("ERROR","X-HUB-Signature-256 validation failed, rejecting request.");
         res.sendStatus(403).end();
    }
    else if (simulatefailures) {
        Logger("RECV","Webhook message " + JSON.stringify(req.body, null, 2));
        Logger("INFO", "Rejecting request with 403");
        res.sendStatus(rejectcode);
    }
    else {
        res.sendStatus(200);
        var jsondata = JSON.parse(jsonrequestbody);

        if (jsondata.type == 'Text')
        {
            Logger("RECV","Outbound text message " + JSON.stringify(req.body, null, 2));
            if (!messagingid)
            {
                 messagingid =  jsondata.id;
            }

            if(!convid)
            {
                var msgid = jsondata.channel.messageId;
            
                let opts = { 
                     'useNormalizedMessage': false // Boolean | If true, response removes deprecated fields (textBody, media, stickers)
                };

                conversationapi.getConversationsMessageDetails(msgid, opts)
                .then((data) => {
                   // console.log(`getConversationsMessageDetails success! data: ${JSON.stringify(data, null, 2)}`);
                    convid = true;
                    conversationid = data.conversationId;
                   Logger("INFO","Associated conversation ID: " + conversationid);
                })
                .catch((err) => {
                    Logger("ERROR","Failure retrieving conversation ID " +  err);

                });
            }
           
            io.sockets.emit('chat message',jsondata.text);

            SendReceiptToOrg(jsondata);
    
        }
        else if (jsondata.type == 'Event')
        {
            if (jsondata.events[0].eventType == 'Typing')
            {
                Logger("RECV","Outbound Typing Event " + JSON.stringify(req.body, null, 2));
                io.sockets.emit('typingind','');                            
            }
        }
        else if (jsondata.type == "Receipt")
        {
            Logger("RECV","Receipt for inbound message " + JSON.stringify(req.body, null, 2));
        }
    }
});

//#endregion

//#region webpage event handling

io.on('connection', (socket) => {
        
   // connectiondictionary[senderid] = socket.id; 
   
   //v2 web page user sent chat message, forwarding it to Genesys Cloud
    socket.on('new_message_from_page', (msg) => {
    const now = new Date();
    var body = {
            "id":senderid,
            "channel": {
                "platform":"Open",
                "type":"Private",
                "messageId":cryptomodule.randomUUID(),
                "to": {
                    "id":openmessagingintegrationid,
                },
                "from":{
                    "nickname":msg.fromname,
                    "id":msg.fromaddress,
                    "idType":"email"
                },
            "time":now.toISOString()
            },
            "type":"Text",
            "text":msg.message,
            "direction":"Inbound"
        };
    

    conversationapi.postConversationsMessageInboundOpenMessage(openmessagingintegrationid, body)
    .then((data) => {
        Logger("XMIT","Sent inbound message " + JSON.stringify(data, null, 2));
    })
    .catch((err) => {
        Logger("ERROR", "Failure sending inbound message " + err);
    });
  
    });

    //v1 web page user sent chat message, forwarding it to Genesys Cloud
    socket.on('chat message', (msg) => {
       const now = new Date();
       var body = {
               "id":senderid,
               "channel": {
                   "platform":"Open",
                   "type":"Private",
                   "messageId":cryptomodule.randomUUID(),
                   "to": {
                       "id":"83862e6c-b4b9-44a9-b02e-6e6fc69450c4",
                   },
                   "from":{
                       "nickname":"Bear",
                       "id":"paddington@example.com",
                       "idType":"email"
                   },
               "time":now.toISOString()
               },
               "type":"Text",
               "text":msg,
               "direction":"Inbound"
           };
              
       const integrationId = '83862e6c-b4b9-44a9-b02e-6e6fc69450c4';
   
       conversationapi.postConversationsMessageInboundOpenMessage(integrationId, body)
        .then((data) => {
            Logger("XMIT","Sent inbound message " + JSON.stringify(data, null, 2));
         })
         .catch((err) => {
            Logger("ERROR", "Failure sending inbound message " + err);
        });
     
    });

    //v2 web page user typing in input box, sending event to Genesys Cloud
    socket.on('page_visitor_typing', (msg) => {

        const now = new Date();
        var body = {
               "channel": {
                   "from":{
                        "nickname":msg.fromname,
                        "id":msg.fromaddress,
                        "idType":"email"
                   },
               "time":now.toISOString()
               },
               "events":[
                {
                    "eventType":"Typing"
                }
               ]
           };
          
       conversationapi.postConversationsMessageInboundOpenEvent(openmessagingintegrationid, body)
        .then((data) => {
            Logger("XMIT", "Sent inbound typing event " + JSON.stringify(data, null, 2));
         })
        .catch((err) => {
             Logger("ERROR","Failure sending inbound typing event " + err);
        });
    
    });

    //v1 web page user typing in input box, sending event to Genesys Cloud
    socket.on('chat typing', (msg) => {
        Logger("INFO", "local chat user typing: ...");

        const now = new Date();
        var body = {
               "channel": {
                   "from":{
                        "nickname":msg.fromname,
                        "id":msg.fromaddress,
                        "idType":"email"
                   },
               "time":now.toISOString()
               },
               "events":[
                {
                    "eventType":"Typing"
                }
               ]
           };
       const integrationId = '83862e6c-b4b9-44a9-b02e-6e6fc69450c4';
   
       conversationapi.postConversationsMessageInboundOpenEvent(integrationId, body)
     .then((data) => {
       Logger("XMIT","Typing event, postConversationsMessageInboundOpenMessage " + JSON.stringify(data, null, 2));
     })
     .catch((err) => {
        Logger("ERROR","Failure sending typing event " + err);
       
     });
    
    });

    //web user closed browser, disconnecting conversation on Genesys Cloud
    socket.on('disconnect', () => {
        Logger("INFO","Webpage user disconnected.");

        if(conversationid){
            Logger("INFO","Disconnecting conversation: " + conversationid);
           
            let body = {"state":"disconnected"};

            conversationapi.patchConversationsMessage(conversationid, body)
                .then((data) => {
                   Logger("INFO","patchConversationsMessage success! data: " + JSON.stringify(data, null, 2));
                })
                .catch((err) => {
                    Logger("ERROR","There was a failure disconnecting conversation" + err);
            });
        }

    });
});


//#endregion

//#region console key input handling


process.stdin.on('keypress',(str,key) => {

    switch(str)
    {
        case 'q':
            CloseServer();
            break;
    }
});

//#endregion

//#region function definitions
function Update_Integration_Webhook_URL()
{
    if (localtunnelused)
    {
        if(tunnel.url)
                currenturl = tunnel.url + "/openmessagingwebhook";
    }
    else
    {
        currenturl = "https://" + process.env.CODESPACE_NAME + "-3000." + process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN + "/openmessagingwebhook";
    }
    

    var body = {
        "outboundNotificationWebhookUrl":currenturl
    };
    
    conversationapi.patchConversationsMessagingIntegrationsOpenIntegrationId(openmessagingintegrationid, body)
    .then((data) => {
        Logger("INFO","Updated Integration Webhook URL to " + data.outboundNotificationWebhookUrl);

    });
}

function CloseServer()
{
    server.closeAllConnections();
    server.close();
    if(localtunnel) tunnel.close();
    Logger("END","Web Server closed!");
    process.exit();
}

function Logger(state, data){
    console.log(new Date().toISOString() + " - " + state + " -- " + data );
}

function SendReceiptToOrg(recvdmessagejson) {
    
    const now = new Date();
    var body = {
            "id":messagingid,
            "channel": {
                "to": {
                    "id":recvdmessagejson.channel.id,
                    "idType":"email"
                },
            "time":now.toISOString()
            },
            "status":"Delivered",
            "direction":"Outbound",
            "isFinalReceipt":true
        };
    
  conversationapi.postConversationsMessageInboundOpenReceipt(openmessagingintegrationid,body)
  .then((data) => {
        Logger("XMIT","Sent receipt for outbound message" + JSON.stringify(data, null, 2));
  })
  .catch((err) => {
        Logger("ERROR", "Failure sending receipt for outbound message " + err);
  });
}

function main()
{

    process.stdin.setRawMode(true);
    readline.emitKeypressEvents(process.stdin);

    switch (process.env.AWS_REGION)
    {
        case "eu-west-1":
            apiclient.setEnvironment(platformclient.PureCloudRegionHosts.eu_west_1);
            break;
        case "eu-west-2":
            apiclient.setEnvironment(platformclient.PureCloudRegionHosts.eu_west_2);
            break;
        case "eu-central-1":
            apiclient.setEnvironment(platformclient.PureCloudRegionHosts.eu_central_1);
            break;
        case "eu-central-2":
            apiclient.setEnvironment(platformclient.PureCloudRegionHosts.eu_central_2);
            break;
        case "us-west-2":
            apiclient.setEnvironment(platformclient.PureCloudRegionHosts.us_west_2);
            break;
        default:
            apiclient.setEnvironment(platformclient.PureCloudRegionHosts.us_east_1);
            break;
    }

    server.listen(3000, () => {
        Logger("START","web server listening on http://localhost:3000");
    });

    apiclient.loginClientCredentialsGrant(process.env.OAUTH_ID, process.env.OAUTH_PW)
            .then(() => {
                Logger("START","Platform API initialized successfully.")
                conversationapi = new platformclient.ConversationsApi();
                
                if (!process.env.CODESPACES)
                {
                    (async () => {
                        tunnel = await localtunnel({port:3000});
            
                        Logger("START","Local tunnel open: " +  tunnel.url);
                        localtunnelused = true;
                        if(conversationapi)
                            Update_Integration_Webhook_URL();
                        
                        tunnel.on('close',() => {
                        });
            
            
                    })();
                }
                else {
                    if(conversationapi)
                     Update_Integration_Webhook_URL();
                }
            
            })
            .catch((err) => {
                Logger("ERROR","Platform API initialization failed " + err);
            });


 


    
}

//#endregion

//#region command line parser
program
    .option('-h, --help', 'help')
    .option('-r, --rejectrequests','simulate failures')
    .option('-d, --debug','debug logging')
    .option('-v, --verbose','verbose logging');


program.parse(process.argv);
const options = program.opts();

if (options.help) {
    console.log("Usage: node server.js [options]");
    console.log("Options: ");
    console.log("   -h     displays this help");
    console.log("   -d     enables extended response for all API function calls");
    console.log("   -v     enabled verbose API logging with request and response body and header");
    console.log("   -r XXX enables webhook rejection with HTTP status code XXX");

}
else if (options.rejectrequests){
    simulatefailures = true;
    rejectcode = program.args[0];
    main();
}
else if (options.debug)
{
    debug = true;    
    apiclient.setReturnExtendedResponses(true);

    main();
}
else if (options.verbose)
{
    debug = true;
    apiclient.config.logger.log_level = apiclient.config.logger.logLevelEnum.level.LTrace;
    apiclient.config.logger.log_format = apiclient.config.logger.logFormatEnum.formats.TEXT;
    apiclient.config.logger.log_request_body = true;
    apiclient.config.logger.log_response_body = true;
    apiclient.config.logger.log_to_console = true;
    apiclient.config.logger.setLogger(); // To apply above changes

    main();
}
else 
{
    debug = false;   
    main();
}

//#endregion
