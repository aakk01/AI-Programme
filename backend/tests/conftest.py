import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from pathlib import Path

# Load env from frontend/.env if REACT_APP_BACKEND_URL missing
if "REACT_APP_BACKEND_URL" not in os.environ:
    load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
# Load backend .env for MONGO_URL/DB_NAME
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else "https://gantt-genius.preview.emergentagent.com"

TEST_EMAIL = "planner@test.com"
TEST_PASSWORD = "Test1234"
EXISTING_PROJECT_ID = "ed60c71a-2483-4e54-b062-e9414efe35ce"


def _mongo_db():
    from pymongo import MongoClient
    c = MongoClient(os.environ["MONGO_URL"])
    return c, c[os.environ["DB_NAME"]]


@pytest.fixture(scope="session")
def mongo_db():
    c, db = _mongo_db()
    yield db
    c.close()


@pytest.fixture(scope="session")
def test_user_id(mongo_db):
    u = mongo_db.users.find_one({"email": TEST_EMAIL}, {"id": 1})
    if not u:
        pytest.skip("test user not present")
    return u["id"]


@pytest.fixture(scope="session", autouse=True)
def ensure_pro_for_test_user(mongo_db):
    """Autouse: ensure the planner test user has a paid pow_pro_monthly tx.

    Existing regression tests (exports / snapshots / AI generate) rely on Pro
    access. New iteration-7 tests that need a FREE-user state should use the
    `free_user` fixture which removes the paid doc for the duration of the test.
    """
    u = mongo_db.users.find_one({"email": TEST_EMAIL}, {"id": 1})
    if not u:
        yield
        return
    uid = u["id"]
    marker_session = f"TEST_AUTOPRO_{uid}"
    mongo_db.payment_transactions.update_one(
        {"session_id": marker_session},
        {"$set": {
            "session_id": marker_session,
            "user_id": uid,
            "lookup_key": "pow_pro_monthly",
            "payment_status": "paid",
            "status": "completed",
            "updated_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    yield
    mongo_db.payment_transactions.delete_many(
        {"session_id": {"$regex": r"^TEST_AUTOPRO_"}}
    )
    # also clean any TEST_ prefixed session_ids left behind
    mongo_db.payment_transactions.delete_many(
        {"session_id": {"$regex": r"^TEST_"}}
    )


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
