import pytest
from pydantic import ValidationError
from app.schemas import ClaimCreate, ItemCreate, SearchInput

def test_search_contract_uses_q_and_100_char_limit():
    assert SearchInput(q="black bag").q == "black bag"
    with pytest.raises(ValidationError): SearchInput(q="x")
    with pytest.raises(ValidationError): SearchInput(q="x" * 101)

def test_first_claim_message_requires_detail():
    with pytest.raises(ValidationError): ClaimCreate(item_id="id", message="too short")

