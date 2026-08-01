"""
Integration tests for InvestmentCommitteeProtocol.

These tests exercise real GenLayer consensus (LLM calls, web fetches,
validator agreement) against a local node, GLSim, or StudioNet.

Run with:
    gltest tests/integration/ -v -s

Requires a running GenLayer node or network configuration. Set the
target network with:
    genlayer network set studio    # StudioNet
    genlayer network set sim       # GLSim (local simulation)

Each test that calls request_recommendation or request_appeal_review
triggers a full non-deterministic consensus round. These tests are
intentionally coarser than direct tests — they verify that the contract
functions correctly in the real GenLayer execution environment.
"""

import json
import time
import pytest
from pathlib import Path

from gltest.direct import VMContext, create_address, deploy_contract

CONTRACT = Path("contract/investment_committee.py")

# ---- Test accounts ----------------------------------------------------------

DAO      = create_address("dao_integration")
PROPOSER = create_address("proposer_integration")
VOTER    = create_address("voter_integration")

DAO_NORM      = "0x" + DAO.hex()
PROPOSER_NORM = "0x" + PROPOSER.hex()


# ---- Shared fixtures --------------------------------------------------------

def _now() -> int:
    return int(time.time())


def _committee_args(deadline_offset: int = 90, appeal_window: int = 60) -> dict:
    return dict(
        dao_name="Integration Test DAO",
        treasury_objective=(
            "Grow the DAO treasury through low-risk, audited DeFi yield strategies "
            "while maintaining at least 80% of deployed capital in instruments "
            "withdrawable within 72 hours."
        ),
        risk_appetite="moderate",
        liquidity_requirement=(
            "At least 80% of deployed capital must be withdrawable within 72 hours "
            "without slippage exceeding 0.5%. Emergency reserves of 20% must remain "
            "in liquid stablecoins at all times."
        ),
        max_single_asset_exposure_bps=2500,
        max_protocol_exposure_bps=4000,
        allowed_asset_classes=["stablecoin", "liquid_staking", "money_market"],
        disallowed_assets=["meme_tokens", "unlocked_vesting_tokens", "derivatives"],
        governance_constraints=(
            "Protocols must have a publicly identified, KYC-verified core team and "
            "at least two independent audits from reputable firms."
        ),
        evaluation_weights={
            "risk": 30,
            "liquidity": 25,
            "fundamentals": 20,
            "governance": 15,
            "treasury_objective_fit": 10,
        },
        proposal_deadline=_now() + deadline_offset,
        appeal_window=appeal_window,
    )


AAVE_PROPOSAL = dict(
    title="Aave V3 USDC Lending — Ethereum Mainnet",
    summary=(
        "Deploy 20% of idle treasury USDC into Aave V3's lending pool on Ethereum "
        "mainnet. Aave V3 is the market-leading decentralised lending protocol with "
        "over $12 billion TVL and a decade of audited, battle-tested smart contract "
        "history. Generates passive yield while preserving instant withdrawal. ~4.8% APY."
    ),
    asset_or_strategy="USDC supply to Aave V3 Ethereum mainnet lending pool",
    allocation_bps=2000,
    expected_holding_period="90-180 days rolling",
    liquidity_profile=(
        "Permissionless withdrawal within a single Ethereum transaction. No lock-up. "
        "Pool utilisation historically below 85% on USDC — instant redemption never "
        "constrained. Meets 72-hour 80% liquidity requirement with margin."
    ),
    risk_thesis=(
        "Zero exploits since January 2023. Audited by Trail of Bits, OpenZeppelin, "
        "and SigmaPrime. Aave Safety Module holds $400M+ as backstop. No liquidation "
        "exposure for stablecoin suppliers. Chainlink oracle feeds with circuit breakers."
    ),
    fundamental_thesis=(
        "USDC is fully backed by cash and US Treasuries, attested monthly by Deloitte. "
        "The USDC market on Aave V3 is the deepest stablecoin lending market in DeFi "
        "with consistent institutional demand creating durable, predictable yield."
    ),
    governance_risks=(
        "AAVE DAO governs with a publicly KYC-verified team. 7-day voting period plus "
        "48-hour timelock. Emergency Guardian (4-of-10 multi-sig) can pause but cannot "
        "move user funds. Two independent audits completed in the past 12 months."
    ),
    evidence_urls=["https://aave.com", "https://defillama.com/protocol/aave-v3"],
)

LIDO_PROPOSAL = dict(
    title="Lido stETH Liquid Staking — Ethereum Mainnet",
    summary=(
        "Stake 15% of DAO ETH via Lido Finance to earn Ethereum consensus layer "
        "staking rewards through liquid stETH. Largest liquid staking protocol with "
        "$20B+ staked ETH. Rebases daily to reflect rewards. Current yield ~3.8% APY."
    ),
    asset_or_strategy="ETH staked via Lido to receive liquid stETH",
    allocation_bps=1500,
    expected_holding_period="180+ days strategic hold",
    liquidity_profile=(
        "stETH trades on Curve ETH/stETH pool with $200M+ liquidity enabling "
        "<0.1% slippage for positions below $5M. ~70% of capital withdrawable within "
        "72 hours via Curve swap. Not suitable for emergency full-position redemption."
    ),
    risk_thesis=(
        "30+ node operators with individual caps prevent concentration. Audited by "
        "Sigma Prime, Quantstamp, MixBytes, and StateMind. Slashing risk socialised. "
        "Primary risk is stETH depeg under stress (max 6% in June 2022, fully recovered)."
    ),
    fundamental_thesis=(
        "Ethereum proof-of-stake generates native yield — not reliant on inflationary "
        "incentives. Lido's operator model diversifies execution risk. 3.8% APY is "
        "denominated in ETH with upside if ETH appreciates versus stablecoins."
    ),
    governance_risks=(
        "Lido DAO governed by LDO token with a publicly identified Lido Labs team. "
        "Four independent audits in 2023-2024. On-chain governance with 72-hour voting "
        "period and 48-hour timelock. Emergency multi-sig: 5-of-9 known individuals."
    ),
    evidence_urls=["https://lido.fi", "https://defillama.com/protocol/lido"],
)


# ---- Helper: wait for committee status --------------------------------------

def _wait_for_status(vm, contract, committee_id: int, target: str,
                     timeout: int = 600, poll: int = 8) -> dict:
    """Poll committee status until target is reached or timeout expires."""
    alt_terminals = {
        "no_suitable_proposal", "insufficient_evidence",
        "policy_violation_detected", "manual_review_required",
    }
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(poll)
        with vm.activate():
            c = contract.get_committee(committee_id)
        if c["status"] == target:
            return c
        if target == "appeal_window_open" and c["status"] in alt_terminals:
            return c  # valid alternative outcome
        if c["status"] in ("finalized", "cancelled"):
            raise AssertionError(f"Unexpected terminal status: {c['status']}")
    raise TimeoutError(
        f"Committee {committee_id} did not reach '{target}' within {timeout}s"
    )


# =============================================================================
# Test: full happy-path flow (single proposal, no appeal)
# =============================================================================

class TestHappyPathNoAppeal:
    """
    Integration test: create committee → submit one compliant proposal →
    close proposals → request LLM recommendation → wait for consensus →
    verify verdict → wait for appeal window → finalize.

    This verifies the complete non-deterministic consensus path end-to-end.
    """

    def test_full_no_appeal_flow(self):
        with VMContext() as vm:
            vm.set_sender(DAO)
            vm.warp(_now())

            contract = deploy_contract(vm, CONTRACT)

            # 1. Create and open committee
            args = _committee_args(deadline_offset=45, appeal_window=30)
            cid = contract.create_committee(**args)
            assert isinstance(cid, int) and cid > 0, "Expected integer committee_id"

            contract.open_committee(cid)
            c = contract.get_committee(cid)
            assert c["status"] == "open_for_proposals"

            # 2. Submit a compliant proposal
            vm.set_sender(PROPOSER)
            pid = contract.submit_proposal(committee_id=cid, **AAVE_PROPOSAL)
            assert isinstance(pid, int) and pid > 0

            # 3. Advance past deadline and close
            vm.set_sender(DAO)
            vm.warp(_now() + 50)
            contract.close_proposals(cid)
            c = contract.get_committee(cid)
            assert c["status"] == "proposal_submission_closed"

            # 4. Request recommendation (triggers real LLM consensus)
            contract.request_recommendation(cid)
            c = contract.get_committee(cid)
            # Status should immediately move to under_consensus_review
            assert c["status"] in ("under_consensus_review", "appeal_window_open"), \
                f"Unexpected status after request_recommendation: {c['status']}"

        # 5. Poll outside the VMContext for up to 10 minutes
        # (consensus round runs asynchronously in GenLayer)
        with VMContext() as vm:
            vm.set_sender(DAO)

            c = _wait_for_status(vm, contract, cid, "appeal_window_open",
                                 timeout=600, poll=10)

            status = c["status"]
            assert status in (
                "appeal_window_open", "no_suitable_proposal",
                "insufficient_evidence", "policy_violation_detected",
                "manual_review_required",
            ), f"Unexpected post-consensus status: {status}"

            # 6. Verify recommendation is stored
            if status == "appeal_window_open":
                rec = contract.get_recommendation_result(cid)
                assert rec["verdict"] in {
                    "proposal_recommended", "no_suitable_proposal",
                    "tie_detected", "insufficient_evidence",
                    "policy_violation_detected", "manual_review_required",
                }
                assert 0 <= rec["confidence"] <= 100
                assert len(rec["short_reason"]) <= 240

                if rec["verdict"] == "proposal_recommended":
                    assert rec["recommended_proposal_id"] == pid, \
                        "Recommended proposal should match the one submitted"

                # 7. Advance past appeal window and finalize
                vm.warp(_now() + 35)
                contract.finalize_recommendation(cid)
                final = contract.get_committee(cid)
                assert final["status"] == "finalized"
                assert final["finalized"] is True


# =============================================================================
# Test: appeal flow (proposal recommended, appeal filed, review, finalize)
# =============================================================================

class TestAppealFlow:
    """
    Integration test: after receiving a recommendation, file an appeal,
    request appeal review (second consensus round), verify result, finalize.
    """

    def test_appeal_review_flow(self):
        with VMContext() as vm:
            vm.set_sender(DAO)
            vm.warp(_now())

            contract = deploy_contract(vm, CONTRACT)

            # 1. Create committee with generous appeal window for testing
            args = _committee_args(deadline_offset=45, appeal_window=120)
            cid = contract.create_committee(**args)
            contract.open_committee(cid)

            # 2. Submit Lido proposal (liquidity is the borderline criterion)
            vm.set_sender(PROPOSER)
            pid = contract.submit_proposal(committee_id=cid, **LIDO_PROPOSAL)

            # 3. Close and request recommendation
            vm.set_sender(DAO)
            vm.warp(_now() + 50)
            contract.close_proposals(cid)
            contract.request_recommendation(cid)

        # 4. Wait for consensus
        with VMContext() as vm:
            vm.set_sender(DAO)
            c = _wait_for_status(vm, contract, cid, "appeal_window_open",
                                 timeout=600, poll=10)

            if c["status"] != "appeal_window_open":
                pytest.skip(
                    f"Recommendation did not reach appeal window (status={c['status']}). "
                    "Skipping appeal flow test."
                )

            rec = contract.get_recommendation_result(cid)
            assert rec["verdict"] in {
                "proposal_recommended", "no_suitable_proposal",
                "insufficient_evidence", "tie_detected",
                "policy_violation_detected", "manual_review_required",
            }

            # 5. File appeal (challenge the liquidity assessment)
            vm.set_sender(VOTER)
            contract.file_appeal(
                committee_id=cid,
                basis="liquidity_misread",
                statement=(
                    "The recommendation did not apply the liquidity requirement strictly. "
                    "stETH's Curve pool can compress significantly under stress conditions "
                    "(as observed in June 2022, with a 6% depeg). The 80% 72-hour "
                    "liquidity claim is not verifiable under conservative stress assumptions. "
                    "This appeal requests that the liquidity_profile be re-evaluated against "
                    "the explicit 0.5% slippage threshold stated in the liquidity_requirement, "
                    "not just under benign market conditions."
                ),
                evidence_urls=["https://lido.fi"],
            )

            c = contract.get_committee(cid)
            assert c["status"] == "appeal_under_review"

            # 6. Request appeal review (second consensus round)
            vm.set_sender(DAO)
            contract.request_appeal_review(cid)

        # 7. Wait for appeal consensus
        with VMContext() as vm:
            vm.set_sender(DAO)
            c = _wait_for_status(vm, contract, cid, "recommendation_issued",
                                 timeout=600, poll=10)
            assert c["status"] == "recommendation_issued"

            appeal = contract.get_appeal(cid)
            assert appeal["result"]["appeal_verdict"] in {
                "appeal_granted", "appeal_rejected", "manual_review_required"
            }
            assert isinstance(appeal["result"]["final_recommendation_changed"], bool)

            # 8. Finalize
            contract.finalize_recommendation(cid)
            final = contract.get_committee(cid)
            assert final["status"] == "finalized"


# =============================================================================
# Test: two competing proposals — validator picks winner
# =============================================================================

class TestCompetingProposals:
    """
    Integration test: two proposals submitted; LLM evaluates both and picks
    the better fit, or returns tie_detected if they score too close.
    """

    def test_two_proposal_evaluation(self):
        with VMContext() as vm:
            vm.set_sender(DAO)
            vm.warp(_now())

            contract = deploy_contract(vm, CONTRACT)

            args = _committee_args(deadline_offset=45, appeal_window=30)
            cid = contract.create_committee(**args)
            contract.open_committee(cid)

            # Submit two proposals from different proposers
            vm.set_sender(PROPOSER)
            pid1 = contract.submit_proposal(committee_id=cid, **AAVE_PROPOSAL)

            vm.set_sender(VOTER)
            pid2 = contract.submit_proposal(committee_id=cid, **LIDO_PROPOSAL)

            assert pid1 != pid2, "Proposals should have distinct IDs"

            vm.set_sender(DAO)
            vm.warp(_now() + 50)
            contract.close_proposals(cid)

            # Verify both proposals are stored
            proposals = contract.get_committee_proposals(cid)
            assert len(proposals) == 2

            contract.request_recommendation(cid)

        # Wait for consensus
        with VMContext() as vm:
            vm.set_sender(DAO)
            c = _wait_for_status(vm, contract, cid, "appeal_window_open",
                                 timeout=600, poll=10)

            assert c["status"] in (
                "appeal_window_open", "no_suitable_proposal",
                "insufficient_evidence", "tie_detected",
                "policy_violation_detected", "manual_review_required",
            ), f"Unexpected status: {c['status']}"

            if c["status"] == "appeal_window_open":
                rec = contract.get_recommendation_result(cid)

                if rec["verdict"] == "proposal_recommended":
                    # Winner must be one of the two submitted proposals
                    assert rec["recommended_proposal_id"] in (pid1, pid2), \
                        f"Winner {rec['recommended_proposal_id']} not in submitted proposals"
                elif rec["verdict"] == "tie_detected":
                    assert rec["recommended_proposal_id"] == 0
                else:
                    # Other valid verdicts are also acceptable
                    pass

                vm.warp(_now() + 35)
                contract.finalize_recommendation(cid)
                final = contract.get_committee(cid)
                assert final["status"] == "finalized"


# =============================================================================
# Test: get_committee_count reflects contract state
# =============================================================================

class TestReadMethods:
    """Verify all read methods return consistent, well-typed data."""

    def test_committee_count_increments(self):
        with VMContext() as vm:
            vm.set_sender(DAO)
            vm.warp(_now())

            contract = deploy_contract(vm, CONTRACT)

            count_0 = contract.get_committee_count()
            assert count_0 == 0

            args = _committee_args()
            contract.create_committee(**args)
            assert contract.get_committee_count() == 1

            contract.create_committee(**args)
            assert contract.get_committee_count() == 2

    def test_get_all_committees_matches_count(self):
        with VMContext() as vm:
            vm.set_sender(DAO)
            vm.warp(_now())

            contract = deploy_contract(vm, CONTRACT)

            for _ in range(3):
                contract.create_committee(**_committee_args())

            count = contract.get_committee_count()
            all_c = contract.get_all_committees()
            assert len(all_c) == count == 3

    def test_get_committees_by_dao(self):
        with VMContext() as vm:
            vm.set_sender(DAO)
            vm.warp(_now())

            contract = deploy_contract(vm, CONTRACT)
            contract.create_committee(**_committee_args())
            contract.create_committee(**_committee_args())

            by_dao = contract.get_committees_by_dao(DAO_NORM)
            assert len(by_dao) == 2
            for c in by_dao:
                assert c["dao"] == DAO_NORM

    def test_get_proposals_by_proposer(self):
        with VMContext() as vm:
            vm.set_sender(DAO)
            vm.warp(_now())

            contract = deploy_contract(vm, CONTRACT)
            args = _committee_args()
            cid = contract.create_committee(**args)
            contract.open_committee(cid)

            vm.set_sender(PROPOSER)
            contract.submit_proposal(committee_id=cid, **AAVE_PROPOSAL)
            contract.submit_proposal(committee_id=cid, **LIDO_PROPOSAL)

            proposals = contract.get_proposals_by_proposer(PROPOSER_NORM)
            assert len(proposals) == 2
            for p in proposals:
                assert p["proposer"] == PROPOSER_NORM
