from app.services.security import decrypt_code, encrypt_code, hash_code, make_qr_token, verify_qr_token

def test_pickup_code_is_encrypted_and_hashed():
    encrypted = encrypt_code("482913", "secret")
    assert "482913" not in encrypted
    assert decrypt_code(encrypted, "secret") == "482913"
    assert hash_code("482913", "claim") != "482913"

def test_qr_token_round_trip():
    token = make_qr_token("claim-id", 4_102_444_800, "secret")
    assert verify_qr_token(token, "secret") == "claim-id"
    assert verify_qr_token(token + "x", "secret") is None
