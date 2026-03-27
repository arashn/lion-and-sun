# Use an official Node.js runtime as a parent image
FROM node:24-slim

# Set the working directory in the container
WORKDIR /app

# Link the published GHCR package back to this repository so Actions can inherit package access.
LABEL org.opencontainers.image.source="https://github.com/arashnabili/lion-and-sun"

# Copy package.json and package-lock.json into the container
COPY package*.json ./

# Install application dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Expose the port your app runs on
EXPOSE 8080

# Define the command to run your app
CMD ["node", "server.js"]
