# Self-host the Social Budget Dashboard with the Bifrost chat proxy.
# Zero dependencies — just Node's built-ins serving index.html + server.js.
#
#   docker build -t social-budget-dashboard .
#   docker run -p 8080:8080 -e BIFROST_API_KEY=sk-... social-budget-dashboard
#   # → http://localhost:8080/
#
FROM node:20-alpine

WORKDIR /app
# Only the files the server actually needs at runtime.
COPY index.html server.js ./

ENV PORT=8080
EXPOSE 8080

# Run as the built-in non-root user.
USER node

CMD ["node", "server.js"]
