# Specify base image

FROM node:alpine

WORKDIR /usr/app

COPY ./package.json ./

# Install some dependencies

RUN npm install

# Copy everything else

COPY ./ ./

# Default command

CMD ["npm", "start"]