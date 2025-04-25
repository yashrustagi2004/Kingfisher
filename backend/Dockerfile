FROM node:18

# Set working directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy rest of the code
COPY . .

# Expose the app port
EXPOSE 4000

# Start the app
CMD ["node", "index.js"]


