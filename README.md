What this is:
This is a basic demo implementation of the Genesys Cloud CX Open Messaging functionality to facilitate learning the communication concepts involved and allow for testing of common network failures such as web application firewall blocking. NodeJS is used to provide middleware and a web chat front end to mimik middleware to proprietary messaging service, https://developer.genesys.cloud/commdigital/digital/openmessaging/

Code provided as is.
Tested on codespaces and MacOS. 

Prereq:
a Genesys Cloud CX Org with
  a basic open messaging platform configuration
  a client credentials oauth 


Usage:
git clone repository to github codespaces or local machine
cd to node_openmessaging app folder
execute npm install
rename file dotenv to .env
replace values in .env for your Genesys Cloud Org
execute node server.js

on successful initialization the node console traces out

 START -- web server listening on http://localhost:3000
 START -- Platform API initialized successfully.
 INFO -- Updated Integration Webhook URL to https://<your local tunnel or codespaces domain>/openmessagingwebhook

open browser to https://<your local tunnel or codespaces domain> to access the chat app front end to send messages to your Genesys Org.
