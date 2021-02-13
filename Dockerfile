FROM node:alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies with package and package lock
COPY package*.json ./

# --no-cache: download package index on-the-fly, no need to cleanup afterwards
# --virtual: bundle packages, remove whole bundle at once, when done
RUN apk --no-cache --virtual build-dependencies add \
    python \
    make \
    g++ \
    && npm install \
    && apk del build-dependencies

# Bundle app source
COPY . .

RUN npm run build

CMD [ "npm", "start" ]