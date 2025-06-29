#!/bin/bash
if [ -d "temp" ]; then
    rm -r temp
    mkdir temp
    cp games.json temp/games.json
    cp -R public temp
    cp index.js temp
    cp package.json temp
    cp jsconfig.json temp
    # cp feedback.json temp # keep feedback.json on the server without overwriting.
else
    mkdir temp
    cp games.json temp/games.json
    cp -R public temp
    cp index.js temp
    cp package.json temp
    cp jsconfig.json temp
    # cp feedback.json temp # keep feedback.json on the server without overwriting.
fi

cd temp

gcloud compute scp --recurse . slfgame-vm2:~ --zone=europe-west4-a

cd ..

rm -r temp