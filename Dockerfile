# ── Stage 1: Build frontend ────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# ── Stage 2: Build Go binary ──────────────────────────────
FROM golang:1.21-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o workey .

# ── Stage 3: Runtime ──────────────────────────────────────
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend /app/workey .
COPY --from=frontend /app/frontend/dist ./frontend/dist/

EXPOSE 8000
VOLUME /app/data
ENV WORKEY_DATA=/app/data

CMD ["./workey"]
