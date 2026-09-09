# Multi-stage build for the self-hosted variant (IMPLEMENTATION_PLAN.md §9).
# Stage 1 builds the Angular app; stage 2 serves the static output with nginx.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Served from `/` on our own host; GitHub Pages uses `--base-href /gitplore/` instead.
ARG BASE_HREF=/
RUN npx ng build --base-href "$BASE_HREF"

FROM nginx:alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/gitplore/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
