import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else "https://gantt-genius.preview.emergentagent.com"

TEST_EMAIL = "planner@test.com"
TEST_PASSWORD = "Test1234"
EXISTING_PROJECT_ID = "ed60c71a-2483-4e54-b062-e9414efe35ce"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def existing_project_id():
    return EXISTING_PROJECT_ID
