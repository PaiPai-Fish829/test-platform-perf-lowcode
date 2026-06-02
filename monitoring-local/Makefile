CLASH_PORT ?= 7890

SHELL := cmd.exe
.SHELLFLAGS := /c

COMPOSE := docker compose
COMPOSE_FALLBACK := docker-compose
PYTHON ?= python

.PHONY: help setup-proxy setup-host-exporter restart-prometheus up down pull-test

help:
	@echo Local monitoring stack (Prometheus + Grafana)
	@echo Targets:
	@echo   make setup-proxy        Configure Docker Desktop proxy for Clash (WSL2)
	@echo   make setup-host-exporter  Start windows_exporter (CPU/memory/network)
	@echo   make restart-prometheus Reload Prometheus config
	@echo   make pull-test          Test docker pull via proxy
	@echo   make up                 Start monitoring stack
	@echo   make down               Stop monitoring stack

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
	@echo Monitoring stack is running.
	@echo URLs:
	@echo   Prometheus Targets: http://localhost:9090/targets
	@echo   Grafana:            http://localhost:3000  (admin / admin)
	@echo Grafana setup:
	@echo   1. Connections -^> Data sources -^> Add data source -^> Prometheus
	@echo   2. URL: http://prometheus:9090
	@echo   3. Import dashboard: monitoring/grafana/dashboards/locust-overview.json

down:
	$(COMPOSE) down || $(COMPOSE_FALLBACK) down
	@echo Monitoring stack stopped.
