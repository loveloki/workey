# ── Stage 1: Build frontend ────────────────────────────────
FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm config set dangerouslyAllowAllBuilds true && pnpm install --frozen-lockfile
COPY frontend/ ./
# 默认同源调用 API；前后端分开部署时才需要设置
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm build

# ── Stage 2: Build Go binary ──────────────────────────────
FROM golang:1.27.1-alpine AS backend
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN git log -1 --format='{"commit":"%h","date":"%cd","content":"%s"}' --date=short > version.json || echo '{"commit":"unknown","date":"unknown","content":"unknown"}' > version.json
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o workey ./cmd/workey

# ── Stage 3: Runtime ──────────────────────────────────────
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend /app/workey .
COPY --from=backend /app/version.json .
COPY --from=frontend /app/frontend/dist ./frontend/dist/

EXPOSE 8000
VOLUME /app/pb_data
ENV WORKEY_DATA=/app/pb_data

CMD ["./workey", "serve", "--http=0.0.0.0:8000"]
