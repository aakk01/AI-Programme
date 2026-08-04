"""Auth: signup / login / token protection."""
import uuid
import requests


def test_login_success(api, base_url):
    r = api.post(f"{base_url}/api/auth/login", json={"email": "planner@test.com", "password": "Test1234"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and len(data["token"]) > 20
    assert data["user"]["email"] == "planner@test.com"


def test_login_wrong_password(api, base_url):
    r = api.post(f"{base_url}/api/auth/login", json={"email": "planner@test.com", "password": "WRONGPASSWORD"}, timeout=30)
    assert r.status_code == 401


def test_projects_no_token_unauthorized(base_url):
    r = requests.get(f"{base_url}/api/projects", timeout=30)
    assert r.status_code in (401, 403)


def test_signup_new_email(api, base_url):
    email = f"test_signup_{uuid.uuid4().hex[:8]}@example.com"
    r = api.post(f"{base_url}/api/auth/signup", json={"email": email, "password": "TestSignup1", "name": "TestUser"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["user"]["email"] == email


def test_auth_me(api, base_url, auth_headers):
    r = api.get(f"{base_url}/api/auth/me", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["email"] == "planner@test.com"
