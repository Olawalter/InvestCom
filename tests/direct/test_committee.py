"""
Direct tests for InvestmentCommitteeProtocol.

Run with:
    pytest tests/direct/ -v

No network or WASM needed — executes in-memory using gltest's VMContext.
LLM and web calls are mocked so tests run in milliseconds.
"""

import json
import pytest
from datetime import datetime, timezone
from pathlib import Path

from gltest.direct import VMContext, create_address, deploy_contract

# ---------------------------------------------------------------------------
# Paths and addresses
# ---------------------------------------------------------------------------

CONTRACT = Path("contract/investment_committee.py")

DAO      = create_address("dao")
PROPOSER = create_address("proposer")
OTHER    = create_address("other")

DAO_NORM      = "0x" + DAO.hex()
PROPOSER_NORM = "0x" + PROPOSER.hex()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _committee_args(deadline_offset: int = 120) -> dict:
    return dict(
        dao_name="GenB Treasury Council",
        treasury_objective=(
            "Grow the DAO treasury through low-risk DeFi yield strategies "
            "while maintaining 72-hour liquidity on at least 80% of deployed capital."
        ),
        risk_appetite="moderate",
        liquidity_requirement=(
            "At least 80% of deployed capital must be withdrawable within 72 hours "
            "without significant slippage (> 0.5%)."
        ),
        max_single_asset_exposure_bps=2000,
        max_protocol_exposure_bps=3000,
        allowed_asset_classes=["stablecoin", "liquid_staking", "money_market"],
        disallowed_assets=["meme_tokens", "unlocked_vesting", "derivatives_without_hedge"],
        governance_constraints=(
            "Protocols must have a public, KYC-verified team and at least 6 months "
            "of audit history from a reputable firm."
        ),
        evaluation_weights={
            "risk": 30,
            "liquidity": 25,
            "fundamentals": 20,
            "governance": 15,
            "treasury_objective_fit": 10,
        },
        proposal_deadline=_now() + deadline_offset,
        appeal_window=3600,
    )


def _proposal_args() -> dict:
    summary = "Deposit USDC into the Aave V3 lending pool on Ethereum mainnet. " * 4
    risk    = "Aave V3 is battle-tested with $10B+ TVL and multiple independent audits. " * 3
    fundas  = "USDC is fully backed by cash and short-term US Treasuries per Circle. " * 3
    gov     = "Aave DAO has a KYC-verified core team and 18 months of audit history. " * 2
    return dict(
        title="Aave V3 USDC Lending Strategy",
        summary=summary,
        asset_or_strategy="USDC on Aave V3",
        allocation_bps=1500,
        expected_holding_period="30-90 days, rolling",
        liquidity_profile="Withdrawable within minutes via Aave V3 instant withdrawal.",
        risk_thesis=risk,
        fundamental_thesis=fundas,
        governance_risks=gov,
        evidence_urls=["https://aave.com", "https://defillama.com/protocol/aave-v3"],
    )


MOCK_WEB = {"method": "GET", "status": 200,
            "body": "Protocol has $5B TVL and strong security track record."}

# Single combined mock satisfying both exec_prompt call shapes.
# request_recommendation checks "verdict"; request_appeal_review checks "appeal_verdict".
# gltest direct mode does not support replacing mock_llm mid-test —
# the first registration wins for the lifetime of the VMContext activation.
MOCK_LLM = json.dumps({
    # recommendation fields
    "verdict": "proposal_recommended",
    "recommended_proposal_id": 1,
    "recommended_proposer": PROPOSER_NORM,
    "confidence": 82,
    "policy_fit_band": "strong",
    "risk_band": "moderate",
    "liquidity_band": "strong",
    "fundamentals_band": "strong",
    "governance_band": "acceptable",
    "treasury_objective_fit": "strong",
    "reason_code": "best_policy_fit",
    "short_reason": "Proposal 1 satisfies all policy constraints with strong fundamentals.",
    "appeal_allowed": True,
    # appeal-review fields (contract only reads these two for its checks)
    "appeal_verdict": "appeal_rejected",
    "final_recommendation_changed": False,
    "new_recommended_proposal_id": 0,
})


# ===========================================================================
# Committee creation
# ===========================================================================

class TestCreateCommittee:
    def test_success_returns_committee_id(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            cid = c.create_committee(**_committee_args())
            assert cid == 1

    def test_stored_committee_has_correct_fields(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            committee = c.get_committee(1)
            assert committee["dao_name"] == "GenB Treasury Council"
            assert committee["status"] == "draft"
            assert committee["risk_appetite"] == "moderate"
            assert committee["dao"].lower() == DAO_NORM.lower()

    def test_multiple_committees_increment_id(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            id1 = c.create_committee(**_committee_args())
            id2 = c.create_committee(**_committee_args())
            assert id1 == 1
            assert id2 == 2

    def test_get_all_committees(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.create_committee(**_committee_args())
            all_c = c.get_all_committees()
            assert len(all_c) == 2

    def test_committees_by_dao_index(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.create_committee(**_committee_args())
            by_dao = c.get_committees_by_dao(DAO_NORM)
            assert len(by_dao) == 2

    def test_dao_name_too_short_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            args = _committee_args()
            args["dao_name"] = "AB"
            with pytest.raises(AssertionError, match="DAO name must be 3"):
                c.create_committee(**args)

    def test_dao_name_too_long_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            args = _committee_args()
            args["dao_name"] = "A" * 81
            with pytest.raises(AssertionError, match="DAO name must be 3"):
                c.create_committee(**args)

    def test_invalid_risk_appetite_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            args = _committee_args()
            args["risk_appetite"] = "yolo"
            with pytest.raises(AssertionError, match="Invalid risk appetite"):
                c.create_committee(**args)

    def test_weights_not_summing_to_100_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            args = _committee_args()
            args["evaluation_weights"] = {
                "risk": 50, "liquidity": 50, "fundamentals": 50,
                "governance": 50, "treasury_objective_fit": 50,
            }
            with pytest.raises(AssertionError, match="Evaluation weights must sum to 100"):
                c.create_committee(**args)

    def test_past_deadline_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            args = _committee_args()
            args["proposal_deadline"] = _now() - 100
            with pytest.raises(AssertionError, match="Proposal deadline must be in the future"):
                c.create_committee(**args)


# ===========================================================================
# Access control
# ===========================================================================

class TestAccessControl:
    def test_non_dao_cannot_open(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            vm.sender = OTHER
            with pytest.raises(AssertionError, match="Only the DAO may open"):
                c.open_committee(1)

    def test_dao_can_open(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)
            assert c.get_committee(1)["status"] == "open_for_proposals"

    def test_non_dao_cannot_cancel(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            vm.sender = OTHER
            with pytest.raises(AssertionError, match="Only the DAO may cancel"):
                c.cancel_committee(1)

    def test_dao_can_cancel_draft(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.cancel_committee(1)
            assert c.get_committee(1)["status"] == "cancelled"

    def test_cannot_cancel_finalized(self):
        vm = VMContext()
        with vm.activate():
            vm.mock_llm(".*", MOCK_LLM)
            vm.mock_web(".*", MOCK_WEB)

            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args(deadline_offset=2))
            c.open_committee(1)

            vm.sender = PROPOSER
            c.submit_proposal(1, **_proposal_args())

            vm.sender = DAO
            c.close_proposals(1)
            vm.warp(_iso(_now() + 10))
            c.request_recommendation(1)
            vm.warp(_iso(_now() + 3700))  # past appeal window
            c.finalize_recommendation(1)

            with pytest.raises(AssertionError, match="Cannot cancel a finali"):
                c.cancel_committee(1)

    def test_open_wrong_status_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)
            with pytest.raises(AssertionError, match="Committee must be in draft status"):
                c.open_committee(1)


# ===========================================================================
# Proposal submission
# ===========================================================================

class TestProposalSubmission:
    def test_submit_while_open(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)

            vm.sender = PROPOSER
            pid = c.submit_proposal(1, **_proposal_args())
            assert pid == 1
            p = c.get_proposal(1)
            assert p["title"] == "Aave V3 USDC Lending Strategy"
            assert p["status"] == "submitted"
            assert p["proposer"].lower() == PROPOSER_NORM.lower()

    def test_proposal_appears_in_committee_list(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)

            vm.sender = PROPOSER
            c.submit_proposal(1, **_proposal_args())
            proposals = c.get_committee_proposals(1)
            assert len(proposals) == 1

    def test_proposals_by_proposer_index(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)

            vm.sender = PROPOSER
            c.submit_proposal(1, **_proposal_args())
            by_proposer = c.get_proposals_by_proposer(PROPOSER_NORM)
            assert len(by_proposer) == 1

    def test_submit_to_draft_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            vm.sender = PROPOSER
            with pytest.raises(AssertionError, match="Committee is not open for proposals"):
                c.submit_proposal(1, **_proposal_args())

    def test_allocation_exceeds_limit_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)
            vm.sender = PROPOSER
            args = _proposal_args()
            args["allocation_bps"] = 5000  # exceeds max_single_asset_exposure_bps=2000
            with pytest.raises(AssertionError, match="Allocation exceeds max single asset exposure"):
                c.submit_proposal(1, **args)

    def test_title_too_short_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)
            vm.sender = PROPOSER
            args = _proposal_args()
            args["title"] = "Short"  # 5 chars, min is 6
            with pytest.raises(AssertionError, match="Title must be 6"):
                c.submit_proposal(1, **args)

    def test_invalid_url_reverts(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)
            vm.sender = PROPOSER
            args = _proposal_args()
            args["evidence_urls"] = ["not-a-url"]
            with pytest.raises(AssertionError, match="Invalid URL"):
                c.submit_proposal(1, **args)

    def test_cannot_close_with_no_proposals(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)
            with pytest.raises(AssertionError, match="No proposals submitted yet"):
                c.close_proposals(1)

    def test_only_proposer_can_revise(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)

            vm.sender = PROPOSER
            c.submit_proposal(1, **_proposal_args())

            vm.sender = OTHER
            with pytest.raises(AssertionError, match="Only the proposer may revise"):
                c.revise_proposal(1, **_proposal_args())


# ===========================================================================
# Recommendation (mocked LLM + web)
# ===========================================================================

class TestRecommendation:
    def test_recommendation_happy_path(self):
        vm = VMContext()
        with vm.activate():
            vm.mock_llm(".*", MOCK_LLM)
            vm.mock_web(".*", MOCK_WEB)

            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args(deadline_offset=2))
            c.open_committee(1)

            vm.sender = PROPOSER
            c.submit_proposal(1, **_proposal_args())

            vm.sender = DAO
            c.close_proposals(1)
            vm.warp(_iso(_now() + 10))
            c.request_recommendation(1)

            committee = c.get_committee(1)
            assert committee["status"] == "appeal_window_open"

            rec = c.get_recommendation_result(1)
            assert rec["verdict"] == "proposal_recommended"
            assert rec["recommended_proposal_id"] == 1
            assert rec["policy_fit_band"] == "strong"

    def test_cannot_request_rec_before_deadline(self):
        vm = VMContext()
        with vm.activate():
            vm.mock_llm(".*", MOCK_LLM)
            vm.mock_web(".*", MOCK_WEB)

            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args(deadline_offset=300))
            c.open_committee(1)

            vm.sender = PROPOSER
            c.submit_proposal(1, **_proposal_args())

            vm.sender = DAO
            c.close_proposals(1)

            with pytest.raises(AssertionError, match="Cannot request a recommendation before the proposal deadline"):
                c.request_recommendation(1)

    def test_cannot_request_rec_wrong_status(self):
        vm = VMContext()
        with vm.activate():
            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args())
            c.open_committee(1)
            with pytest.raises(AssertionError, match="Proposals must be closed"):
                c.request_recommendation(1)

    def test_appeal_and_finalize(self):
        """Full happy path: recommend → appeal → appeal review → finalize."""
        vm = VMContext()
        with vm.activate():
            # MOCK_LLM covers both exec_prompt call shapes in a single registration
            # because gltest direct mode does not support replacing mock_llm mid-test.
            vm.mock_llm(".*", MOCK_LLM)
            vm.mock_web(".*", MOCK_WEB)

            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args(deadline_offset=2))
            c.open_committee(1)

            vm.sender = PROPOSER
            c.submit_proposal(1, **_proposal_args())

            vm.sender = DAO
            c.close_proposals(1)
            vm.warp(_iso(_now() + 10))
            c.request_recommendation(1)
            assert c.get_committee(1)["status"] == "appeal_window_open"

            # File appeal during appeal window
            vm.sender = OTHER
            c.file_appeal(
                1,
                "fundamental_misread",
                "The original analysis understated the protocol's audit track record.",
                ["https://aave.com/security"],
            )
            assert c.get_committee(1)["status"] == "appeal_under_review"

            # DAO requests appeal review (MOCK_LLM has "appeal_verdict" field)
            vm.sender = DAO
            c.request_appeal_review(1)
            assert c.get_committee(1)["status"] == "recommendation_issued"

            # Finalize (appeal window check is skipped when status is recommendation_issued)
            c.finalize_recommendation(1)
            assert c.get_committee(1)["status"] == "finalized"
            assert c.get_committee(1)["finalized"] is True

    def test_cannot_finalize_before_appeal_window_closes(self):
        vm = VMContext()
        with vm.activate():
            vm.mock_llm(".*", MOCK_LLM)
            vm.mock_web(".*", MOCK_WEB)

            vm.sender = DAO
            c = deploy_contract(CONTRACT, vm)
            c.create_committee(**_committee_args(deadline_offset=2))
            c.open_committee(1)

            vm.sender = PROPOSER
            c.submit_proposal(1, **_proposal_args())

            vm.sender = DAO
            c.close_proposals(1)
            vm.warp(_iso(_now() + 10))
            c.request_recommendation(1)

            # Appeal window is still open — finalize must reject
            with pytest.raises(AssertionError, match="Appeal window has not closed yet"):
                c.finalize_recommendation(1)
