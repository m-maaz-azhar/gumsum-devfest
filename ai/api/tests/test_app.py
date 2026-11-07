def test_health(client):
    response = client.get("/v1/health")
    assert response.status_code == 200
    assert response.json == {"data": {"status": "ok"}}

def test_swagger_assets(client):
    assert client.get("/docs").status_code == 200
    spec = client.get("/openapi.yaml")
    assert spec.status_code == 200
    assert b"openapi: 3.1.0" in spec.data

def test_auth_required(client):
    response = client.get("/v1/me")
    assert response.status_code == 401
    assert response.json["error"]["code"] == "UNAUTHENTICATED"
