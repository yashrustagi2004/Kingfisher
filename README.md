# Kingfisher 

# Introduction

Phishing emails are cybersecurity threats that can trick users into revealing sensitive information such as passwords, financial details, or personal data. Traditional rule-based detection methods struggle with evolving phishing tactics. 

Kingfisher is our proposed solution for real-time detection of phishing attempts made through emails. It is a Chrome Extension for detection of phishing emails using Natural Language Processing (NLP).

# Product Features

1. Created for Real-time phishing email detection
2. Is able to scan emails for phishing attempts even in languages other than English
   (Currently supported for French and Spanish only)
4. Satisfies user privacy by allowing users to specify which emails should not be scanned.
5. Provides 3 levels of security
   - Email Header checker
   - URL Scanner
   - Text Analysis using NLP


# Tech Stack And Technologies Used

1. Backend: NodeJS, ExpressJS
2. Frontend: ReactJS
3. Database: MongoDB
5. Security: Google Auth

# Installation and Setup Guide
## 1 Manual Installation
### Clone this repository

```
git clone https://github.com/yashrustagi2004/Kingfisher.git
cd Kingfisher
```
### Install Dependencies
- #### Install backend dependencies

```
cd backend
npm install
```
- #### Install NLP Service dependencies

```
cd ../nlp-service
pip install -r requirements.txt
```
### Run Services Manually
- #### Start backend server
```
cd backend
npm start
```
- #### Start NLP service
```
docker pull ishikasahu2504/phishing:latest
docker run -p 5000:5000 --name nlp-container nlp-service
```
- #### Run the build for the extension
```
cd ../popup
npm run build
```
- #### Run the Libre Translate Container
Open the terminal
```
docker run -it --name translator \
  -p 3000:5000 \
  -v $HOME/libretranslate_data:/app/libretranslate/data \
  -e LT_LOAD_ONLY="en,es,fr" \
  libretranslate/libretranslate
```

## 2 Docker Installation
### Start services using docker compose
```
docker-compose up --build
```
### Verify running containers
```
docker ps
```

# Run the Chrome Extension
1. Open Google Chrome
2. Go to chrome://extensions/
3. Enable Developer Mode (top right corner)
4. Click Load unpacked
5. Select the popup/ folder
 
# Contributors
- Yash Rustagi 
- Ishika Sahu
- Arjav Jhamb  
- Aditya Chawla 
  




