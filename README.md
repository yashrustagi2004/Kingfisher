# Kingf# 

# Introduction

Phishing emails are cybersecurity threats that can trick users into revealing sensitive information such as passwords, financial details, or personal data. Traditional rule-based detection methods struggle with evolving phishing tactics. This project aims to develop an NLP-based phishing email detection system that can analyze email content, identify suspicious patterns, and classify emails as phishing or legitimate. By leveraging machine learning and NLP techniques, the system will improve detection accuracy, reduce false positives, and enhance email security.

# Proposed Methodology

1. Checking Email Headers: SPF, DKIM, DMARC
2. Cross-checking the urls in the body in our exhaustive database to detect phishing links.
3. Understanding the sentiment of the email body using NLP and alerting the user for any suspicious email.

# Product Functionality 
1. -Real-time phishing email detection
2. Multilingual Support
3. User Privacy
4. Mail Analysis
5. User Awareness
6. Reporting System

# Tech Stack And Technologies Used

1. Backend: NodeJS, ExpressJS

2. Frontend: ReactJS

3. Database: MongoDB

4. Other Tools: GitHub/Git, Jenkins, Docker, Obsidian

5. Security & NLP: Google Auth, Google BERT


# Modules
1. user management
2. url scanner
3. email header checker
4. translation
5. nlp model
6. malicious_domains
7. database
8. search 

# Project Working 

User Authentication: Users log into the system using their credentials via Google Auth.

Email Submission: Email scanned by the program.

Email Header Analysis: The system extracts email headers and verifies SPF, DKIM, and DMARC records.

URL & Domain Verification: Any links in the email are cross-checked against a phishing database to identify potential threats.

NLP-Based Content Analysis: The email text undergoes sentiment and intent analysis using Google BERT to detect suspicious wording.

Phishing Score Generation: Based on the above checks, Kingfisher assigns a category.

User Notification & Action: The user is presented with a report detailing why the email was flagged, and they can choose to report it if necessary.

Reporting & Awareness: Reported emails are stored for further investigation, and users are educated on phishing risks.

# Contributors
•	Yash Rustagi 
•	Arjav Jhamb  
•	Aditya Chawla 
•   Ishika Sahu




