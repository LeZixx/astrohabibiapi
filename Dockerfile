FROM node:18

WORKDIR /usr/src/app

COPY . .
RUN echo "📁 Contents of /usr/src/app:" && ls -la /usr/src/app
RUN echo "DEBUG LISTING:" && ls -la /usr/src/app/utils
RUN npm install

EXPOSE 8080

CMD ["npm", "start"]
RUN ls -R /usr/src/app