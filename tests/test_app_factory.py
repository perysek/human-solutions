def test_app_boots(app):
    assert app is not None


def test_health_endpoint(app):
    client = app.test_client()
    resp = client.get('/')
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'ok'
