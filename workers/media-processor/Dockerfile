FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json crop-plan.mjs encoding-plan.mjs timeline-plan.mjs processor.mjs ./

USER node
CMD ["node", "processor.mjs"]
