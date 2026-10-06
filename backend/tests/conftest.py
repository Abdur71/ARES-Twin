"""Test configuration: temporary database and offline space weather (cached JSON only, no network)."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="ares_twin_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SPACEWEATHER_OFFLINE"] = "True"

import pytest  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:  # runs the lifespan → creates and seeds the database
        yield c
