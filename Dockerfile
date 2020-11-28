FROM node:14

VOLUME [ "/storage" ]
COPY server /
RUN yarn --cwd /server

CMD [ "node", "/server" ]
