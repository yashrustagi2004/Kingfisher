#!/bin/bash

npm run build

cp ../manifest.json build/

cp ../background.js build/

cp -r ../images build/

echo "build done."
