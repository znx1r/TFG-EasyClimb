PY ?= .venv/bin/python
PIP ?= .venv/bin/pip

.PHONY: venv install test test-unit test-acceptance run

venv:
	python3.12 -m venv .venv
	$(PIP) install -U pip
	$(PIP) install -r requirements-dev.txt

install: venv

test:
	$(PY) -m pytest

test-unit:
	$(PY) -m pytest -m unit

test-acceptance:
	$(PY) -m pytest -m acceptance

run:
	$(PY) -m uvicorn src.api.main:app --host 0.0.0.0 --port 8000
