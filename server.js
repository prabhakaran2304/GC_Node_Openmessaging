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

//
const awsregion = platformclient.PureCloudRegionHosts.eu_west_2;
const oauthid = "ce4e0435-4627-4497-8906-d4c378840565";
const oauthpw = "tK3kv0K71EMet8q-YR1R-0Y_kCSO3Q-AKSZ4QCXdjoI";
const openmessagingintegrationid = "83862e6c-b4b9-44a9-b02e-6e6fc69450c4";
const openmessagingintegrationsecret = "1234";
const mylocaltunnelsubdomain = "abetztesting";
//


var conversationapi;
var senderid = cryptomodule.randomUUID();
var connectiondictionary = {};
var convid = false;
var conversationid;
var messagingid;

apiclient.setEnvironment(awsregionç);
apiclient.config.logger.log_level = apiclient.config.logger.logLevelEnum.level.LDebug;
apiclient.config.logger.log_format = apiclient.config.logger.logFormatEnum.formats.TEXT;
apiclient.config.logger.log_request_body = true;
apiclient.config.logger.log_response_body = true;
apiclient.config.logger.log_to_console = true;
//apiclient.config.logger.log_file_path = "openmessagingdemo.log";

apiclient.config.logger.setLogger(); // To apply above changes

/*
/ web server handling external requests
*/
app.use(express.json());

app.get('/', (req,res) => {
    console.log('chat page requested');
    res.sendFile(__dirname + '/index.html');
});

app.post('/openmessagingwebhook', (req,res) => {

    console.log('webhook message received');
   // console.log(JSON.stringify(req.headers));
   // console.log(JSON.stringify(req.body));

    // integration - the integration object
    // normalizedMessage - the NormalizedMessage payload
    // request - webhook request object

    const jsonrequestbody = JSON.stringify(req.body);
    const signature = req.headers['x-hub-signature-256'];
    const messageHash = cryptomodule.createHmac('sha256',  openmessagingintegrationsecret)
     .update(jsonrequestbody)
     .digest('base64');

    // console.log(`sha256=${messageHash}`);
    // console.log(signature);
   
   if (`sha256=${messageHash}` !== signature) {
         //throw new Error("Webhook Validation Failed! Throw this away.");
         console.log('signature match error');
         res.sendStatus(403).end();
    }
     else {
        console.log('signature match success');
        res.sendStatus(200);
        var jsondata = JSON.parse(jsonrequestbody);

        if (jsondata.type == 'Text')
        {

            if (!messagingid)
            {
                 messagingid =  jsondata.id;
                 console.log('messaging id ', messagingid);
            }

            if(!convid)
            {
                console.log('looking up conversation id');
                var msgid = jsondata.channel.messageId;
            
                let opts = { 
                     'useNormalizedMessage': false // Boolean | If true, response removes deprecated fields (textBody, media, stickers)
                };

                conversationapi.getConversationsMessageDetails(msgid, opts)
                .then((data) => {
                    console.log(`getConversationsMessageDetails success! data: ${JSON.stringify(data, null, 2)}`);
                    convid = true;
                    conversationid = data.conversationId;
                    console.log('conversation id: ', conversationid);
                })
                .catch((err) => {
                    console.log('There was a failure calling getConversationsMessageDetails');
                    console.error(err);
                });
            }
           
            io.sockets.emit('chat message',jsondata.text);

            SendInboundReceiptToOrg(jsondata);
    
        }
        else if (jsondata.type == 'Event')
        {
            if (jsondata.events[0].eventType == 'Typing')
            {
                io.sockets.emit('typingind','');                            
            }
        }
    }
});


/*
/ page handling internal requests
*/
io.on('connection', (socket) => {
    console.log('a new web page user connected');

    
   // connectiondictionary[senderid] = socket.id; 
   
   //v2 web page user sent chat message, forwarding it to Genesys Cloud
   socket.on('new_message_from_page', (msg) => {
    console.log('Sending message...');
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
    
   // console.log(body);
    

    conversationapi.postConversationsMessageInboundOpenMessage(openmessagingintegrationid, body)
    .then((data) => {
            console.log(`postConversationsMessageInboundOpenMessage success! data: ${JSON.stringify(data, null, 2)}`);
    })
    .catch((err) => {
        console.log('There was a failure calling postConversationsMessageInboundOpenMessage');
        console.error(err);
    });
  
    });

    //v1 web page user sent chat message, forwarding it to Genesys Cloud
    socket.on('chat message', (msg) => {
       console.log('Sending message...');
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
       
       console.log(body);
       
       const integrationId = '83862e6c-b4b9-44a9-b02e-6e6fc69450c4';
   
       conversationapi.postConversationsMessageInboundOpenMessage(integrationId, body)
        .then((data) => {
            console.log(`postConversationsMessageInboundOpenMessage success! data: ${JSON.stringify(data, null, 2)}`);
         })
         .catch((err) => {
           console.log('There was a failure calling postConversationsMessageInboundOpenMessage');
          console.error(err);
        });
     
    });

    //v2 web page user typing in input box, sending event to Genesys Cloud
    socket.on('page_visitor_typing', (msg) => {
        console.log('chat typing: ...');

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
       
       //console.log(body);
   
       conversationapi.postConversationsMessageInboundOpenEvent(openmessagingintegrationid, body)
        .then((data) => {
            console.log(`postConversationsMessageInboundOpenMessage success! data: ${JSON.stringify(data, null, 2)}`);
         })
        .catch((err) => {
             console.log('There was a failure calling postConversationsMessageInboundOpenMessage');
             console.error(err);
        });
    
    });

    //v1 web page user typing in input box, sending event to Genesys Cloud
    socket.on('chat typing', (msg) => {
        console.log('chat typing: ...');

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
       
       console.log(body);
       
       const integrationId = '83862e6c-b4b9-44a9-b02e-6e6fc69450c4';
   
       conversationapi.postConversationsMessageInboundOpenEvent(integrationId, body)
     .then((data) => {
       console.log(`postConversationsMessageInboundOpenMessage success! data: ${JSON.stringify(data, null, 2)}`);
     })
     .catch((err) => {
       console.log('There was a failure calling postConversationsMessageInboundOpenMessage');
       console.error(err);
     });
    
    });

    //web user closed browser, disconnecting conversation on Genesys Cloud
    socket.on('disconnect', () => {
        console.log('a user disconnected');

        if(conversationid){
            console.log('disconnecting conversation: ' + conversationid);
        let body = {"state":"disconnected"};

        conversationapi.patchConversationsMessage(conversationid, body)
            .then((data) => {
                console.log(`patchConversationsMessage success! data: ${JSON.stringify(data, null, 2)}`);
            })
            .catch((err) => {
                console.log('There was a failure calling patchConversationsMessage');
                console.error(err);
            });
        }

    });
});


/*
function SendInboundMessageToOrg(chatmessage) {
    console.log('Sending message...');
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
            "text":chatmessage,
            "direction":"Inbound"
        };
    
    console.log(body);
    
    const integrationId = '83862e6c-b4b9-44a9-b02e-6e6fc69450c4';

    conversationapi.postConversationsMessageInboundOpenMessage(integrationId, body)
  .then((data) => {
    console.log(`postConversationsMessageInboundOpenMessage success! data: ${JSON.stringify(data, null, 2)}`);
  })
  .catch((err) => {
    console.log('There was a failure calling postConversationsMessageInboundOpenMessage');
    console.error(err);
  });
}
*/

function SendInboundReceiptToOrg(recvdmessagejson) {
    console.log('Sending receipt...');
    
    const now = new Date();
    var body = {
            "id":messagingid,
            "channel": {
                "to": {
                    //"id":"83862e6c-b4b9-44a9-b02e-6e6fc69450c4",
                    "id":recvdmessagejson.channel.id,
                    "idType":"email"
                },
            "time":now.toISOString()
            },
            "status":"Delivered",
            "direction":"Outbound",
            "isFinalReceipt":true
        };
    
   // console.log(body);


   // conversationapi.postConversationsMessageInboundOpenMessage(integrationId, body)
   conversationapi.postConversationsMessageInboundOpenReceipt(openmessagingintegrationid,body)
  .then((data) => {
    console.log(`postConversationsMessageInboundOpenMessage success! data: ${JSON.stringify(data, null, 2)}`);
  })
  .catch((err) => {
    console.log('There was a failure calling postConversationsMessageInboundOpenMessage');
    console.error(err);
  });
}

server.listen(3000, () => {
    console.log('server listening on http://*:3000');

    apiclient.loginClientCredentialsGrant(oauthid, oauthpw)
    .then(() => {
        console.log('SDK authenticated');
        conversationapi = new platformclient.ConversationsApi();
    })
    .catch((err) => {
        console.log('SDK authentication failure', err);
    });

    (async () => {
        const tunnel = await localtunnel({port:3000,subdomain:mylocaltunnelsubdomain});

        console.log(tunnel.url);
        tunnel.on('close',() => {
            //tunnels are closed
        });
    })();
    
});

