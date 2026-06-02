CLASH_PORT ?= 7890

SHELL := cmd.exe
.SHELLFLAGS := /c

COMPOSE := docker compose
COMPOSE_FALLBACK := docker-compose
PYTHON ?= python

.PHONY: help setup-proxy setup-host-exporter restart-prometheus up down pull-test gen-config

help:
	@echo Dev monitoring stack (Prometheus + Grafana)
	@echo Targets:
	@echo   make setup-proxy          Configure Docker Desktop proxy for Clash (WSL2)
	@echo   make setup-host-exporter  Start windows_exporter (CPU/memory/network)
	@echo   make restart-prometheus   Reload Prometheus config
	@echo   make pull-test            Test docker pull via proxy
	@echo   make up                   Start dev monitoring stack
	@echo   make down                 Stop dev monitoring stack

setup-proxy:
	$(PYTHON) setup-docker-proxy.py

setup-host-exporter:
	$(PYTHON) setup-host-exporter.py

restart-prometheus:
	$(COMPOSE) restart prometheus || $(COMPOSE_FALLBACK) restart prometheus
	@echo Prometheus reloaded. Check http://localhost:9090/targets

pull-test:
	docker pull hello-world:latest

up:
	$(COMPOSE) up -d || $(COMPOSE_FALLBACK) up -d
	@echo Dev monitoring stack is running.
	@echo URLs:
	@echo   Prometheus Targets: http://localhost:9090/targets
	@echo   Grafana:            http://localhost:3000  (admin / admin)
	@echo Dashboards auto-loaded from deployment/observability/grafana/dashboards/

down:
	$(COMPOSE) down || $(COMPOSE_FALLBACK) down
	@echo Dev monitoring stack stopped.
