FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY config ./config
COPY internal ./internal
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache git docker-cli ca-certificates
COPY --from=build /out/server /usr/local/bin/server
WORKDIR /app
EXPOSE 8080
ENTRYPOINT ["server"]
