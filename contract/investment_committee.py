# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from datetime import datetime, timezone
import json

# ─── Valid enum sets ──────────────────────────────────────────────────────────

VALID_RISK_APPETITES = {"conservative", "moderate", "aggressive"}

VALID_VERDICTS = {
    "proposal_recommended",
    "no_suitable_proposal",
    "tie_detected",
    "insufficient_evidence",
    "policy_violation_detected",
    "manual_review_required",
}

VALID_APPEAL_BASES = {
    "new_risk_evidence",
    "liquidity_misread",
    "fundamental_misread",
    "governance_risk_misread",
    "policy_constraint_misapplied",
    "allocation_limit_error",
    "evidence_url_misread",
    "conflict_of_interest_claim",
}

VALID_POLICY_FIT_BANDS   = {"poor", "weak", "acceptable", "strong", "excellent"}
VALID_RISK_BANDS         = {"excessive", "high", "moderate", "low", "minimal"}
VALID_LIQUIDITY_BANDS    = {"illiquid", "weak", "acceptable", "strong", "excellent"}
VALID_FUNDAMENTALS_BANDS = {"weak", "questionable", "acceptable", "strong", "excellent"}
VALID_GOVERNANCE_BANDS   = {"dangerous", "weak", "acceptable", "strong", "excellent"}
VALID_OBJECTIVE_BANDS    = {"misaligned", "weak", "acceptable", "strong", "excellent"}

# Fields that must match exactly between leader and validator outputs
CANONICAL_FIELDS = [
    "verdict",
    "recommended_proposal_id",
    "policy_fit_band",
    "risk_band",
    "liquidity_band",
    "fundamentals_band",
    "governance_band",
    "treasury_objective_fit",
    # reason_code is free-form text — excluded from consensus check to avoid
    # false disagreements between validators calling the LLM independently
]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _now() -> int:
    # GenVM pins datetime.now() to the transaction timestamp — deterministic across validators
    return int(datetime.now(timezone.utc).timestamp())


def _validate_url(url: str) -> bool:
    return url.startswith("http://") or url.startswith("https://")


def _validate_weights(weights: dict) -> bool:
    try:
        return sum(int(v) for v in weights.values()) == 100
    except Exception:
        return False


def _confidence_band(c: int) -> str:
    if c >= 75:
        return "high"
    if c >= 50:
        return "medium"
    return "low"


# ─── Contract ─────────────────────────────────────────────────────────────────

class InvestmentCommitteeProtocol(gl.Contract):
    # ── Counters (GenVM sized integer — not plain int) ────────────────────────
    _committee_counter: u64
    _proposal_counter: u64
    _appeal_counter: u64

    # ── Primary storage: entity blobs as JSON strings ─────────────────────────
    # Plain dict/list/int are forbidden in storage; use TreeMap[K, V] and u64
    _committees:      TreeMap[str, str]   # str(committee_id) -> JSON
    _proposals:       TreeMap[str, str]   # str(proposal_id)  -> JSON
    _recommendations: TreeMap[str, str]   # str(committee_id) -> JSON
    _appeals:         TreeMap[str, str]   # str(committee_id) -> JSON

    # ── Index maps ────────────────────────────────────────────────────────────
    _committees_by_dao:       TreeMap[str, str]  # dao_address      -> JSON list of cids
    _proposals_by_committee:  TreeMap[str, str]  # str(cid)         -> JSON list of pids
    _proposals_by_proposer:   TreeMap[str, str]  # proposer_address -> JSON list of pids

    def __init__(self) -> None:
        # u64 and TreeMap storage fields are zero-initialised by GenVM;
        # explicit assignment here is for clarity only.
        self._committee_counter = u64(0)
        self._proposal_counter  = u64(0)
        self._appeal_counter    = u64(0)

    # ── Internal loaders ──────────────────────────────────────────────────────

    def _load_committee(self, committee_id: int) -> dict:
        raw = self._committees.get(str(committee_id), "")
        assert raw != "", f"Committee {committee_id} not found"
        return json.loads(raw)

    def _load_proposal(self, proposal_id: int) -> dict:
        raw = self._proposals.get(str(proposal_id), "")
        assert raw != "", f"Proposal {proposal_id} not found"
        return json.loads(raw)

    def _proposal_ids_for(self, committee_id: int) -> list:
        return json.loads(self._proposals_by_committee.get(str(committee_id), "[]"))

    # ══════════════════════════════════════════════════════════════════════════
    # Committee methods
    # ══════════════════════════════════════════════════════════════════════════

    @gl.public.write
    def create_committee(
        self,
        dao_name: str,
        treasury_objective: str,
        risk_appetite: str,
        liquidity_requirement: str,
        max_single_asset_exposure_bps: int,
        max_protocol_exposure_bps: int,
        allowed_asset_classes: list,
        disallowed_assets: list,
        governance_constraints: str,
        evaluation_weights: dict,
        proposal_deadline: int,
        appeal_window: int,
    ) -> int:
        assert 3 <= len(dao_name) <= 80, "DAO name must be 3–80 chars"
        assert 30 <= len(treasury_objective) <= 2000, "Treasury objective must be 30–2000 chars"
        assert risk_appetite in VALID_RISK_APPETITES, f"Invalid risk appetite: {risk_appetite}"
        assert 20 <= len(liquidity_requirement) <= 1000, "Liquidity requirement must be 20–1000 chars"
        assert _validate_weights(evaluation_weights), "Evaluation weights must sum to 100"
        assert proposal_deadline > _now(), "Proposal deadline must be in the future"
        assert appeal_window > 0, "Appeal window must be positive (seconds)"

        self._committee_counter = u64(int(self._committee_counter) + 1)
        cid = int(self._committee_counter)
        dao = str(gl.message.sender_address)

        committee = {
            "committee_id": cid,
            "dao": dao,
            "dao_name": dao_name,
            "treasury_objective": treasury_objective,
            "risk_appetite": risk_appetite,
            "liquidity_requirement": liquidity_requirement,
            "max_single_asset_exposure_bps": max_single_asset_exposure_bps,
            "max_protocol_exposure_bps": max_protocol_exposure_bps,
            "allowed_asset_classes": allowed_asset_classes,
            "disallowed_assets": disallowed_assets,
            "governance_constraints": governance_constraints,
            "evaluation_weights": evaluation_weights,
            "proposal_deadline": proposal_deadline,
            "appeal_window": appeal_window,
            "appeal_deadline": 0,
            "status": "draft",
            "created_at": _now(),
            "finalized": False,
        }
        self._committees[str(cid)] = json.dumps(committee)

        existing_dao_ids = json.loads(self._committees_by_dao.get(dao, "[]"))
        existing_dao_ids.append(cid)
        self._committees_by_dao[dao] = json.dumps(existing_dao_ids)

        self._proposals_by_committee[str(cid)] = "[]"

        return cid

    @gl.public.write
    def open_committee(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert str(gl.message.sender_address) == c["dao"], "Only the DAO may open this committee"
        assert c["status"] == "draft", "Committee must be in draft status"
        c["status"] = "open_for_proposals"
        self._committees[str(committee_id)] = json.dumps(c)

    @gl.public.write
    def close_proposals(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert str(gl.message.sender_address) == c["dao"], "Only the DAO may close proposals"
        assert c["status"] == "open_for_proposals", "Committee must be open for proposals"
        assert len(self._proposal_ids_for(committee_id)) > 0, "No proposals submitted yet"
        c["status"] = "proposal_submission_closed"
        self._committees[str(committee_id)] = json.dumps(c)

    @gl.public.write
    def cancel_committee(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert str(gl.message.sender_address) == c["dao"], "Only the DAO may cancel"
        assert c["status"] not in {"finalized", "cancelled"}, "Cannot cancel a finalised committee"
        c["status"] = "cancelled"
        self._committees[str(committee_id)] = json.dumps(c)

    # ══════════════════════════════════════════════════════════════════════════
    # Proposal methods
    # ══════════════════════════════════════════════════════════════════════════

    @gl.public.write
    def submit_proposal(
        self,
        committee_id: int,
        title: str,
        summary: str,
        asset_or_strategy: str,
        allocation_bps: int,
        expected_holding_period: str,
        liquidity_profile: str,
        risk_thesis: str,
        fundamental_thesis: str,
        governance_risks: str,
        evidence_urls: list,
    ) -> int:
        c = self._load_committee(committee_id)
        assert c["status"] == "open_for_proposals", "Committee is not open for proposals"
        assert _now() < c["proposal_deadline"], "Proposal deadline has passed"
        assert 6  <= len(title)              <= 120,  "Title must be 6–120 chars"
        assert 50 <= len(summary)            <= 3000, "Summary must be 50–3000 chars"
        assert 50 <= len(risk_thesis)        <= 3000, "Risk thesis must be 50–3000 chars"
        assert 50 <= len(fundamental_thesis) <= 3000, "Fundamental thesis must be 50–3000 chars"
        assert 30 <= len(governance_risks)   <= 2000, "Governance risks must be 30–2000 chars"
        assert len(liquidity_profile) >= 1, "Liquidity profile cannot be empty"
        assert 1 <= len(evidence_urls) <= 8, "Must provide 1–8 evidence URLs"
        for url in evidence_urls:
            assert _validate_url(url), f"Invalid URL: {url}"
        assert allocation_bps <= c["max_single_asset_exposure_bps"], \
            f"Allocation exceeds max single asset exposure ({c['max_single_asset_exposure_bps']} bps)"

        self._proposal_counter = u64(int(self._proposal_counter) + 1)
        pid      = int(self._proposal_counter)
        proposer = str(gl.message.sender_address)
        now      = _now()

        proposal = {
            "proposal_id": pid,
            "committee_id": committee_id,
            "proposer": proposer,
            "title": title,
            "summary": summary,
            "asset_or_strategy": asset_or_strategy,
            "allocation_bps": allocation_bps,
            "expected_holding_period": expected_holding_period,
            "liquidity_profile": liquidity_profile,
            "risk_thesis": risk_thesis,
            "fundamental_thesis": fundamental_thesis,
            "governance_risks": governance_risks,
            "evidence_urls": evidence_urls,
            "submitted_at": now,
            "revised_at": now,
            "status": "submitted",
        }
        self._proposals[str(pid)] = json.dumps(proposal)

        pid_list = self._proposal_ids_for(committee_id)
        pid_list.append(pid)
        self._proposals_by_committee[str(committee_id)] = json.dumps(pid_list)

        existing = json.loads(self._proposals_by_proposer.get(proposer, "[]"))
        existing.append(pid)
        self._proposals_by_proposer[proposer] = json.dumps(existing)

        return pid

    @gl.public.write
    def revise_proposal(
        self,
        proposal_id: int,
        title: str,
        summary: str,
        asset_or_strategy: str,
        allocation_bps: int,
        expected_holding_period: str,
        liquidity_profile: str,
        risk_thesis: str,
        fundamental_thesis: str,
        governance_risks: str,
        evidence_urls: list,
    ) -> None:
        p = self._load_proposal(proposal_id)
        assert p["proposer"] == str(gl.message.sender_address), "Only the proposer may revise"
        c = self._load_committee(p["committee_id"])
        assert c["status"] == "open_for_proposals", "Revision only allowed while committee is open"
        assert _now() < c["proposal_deadline"], "Proposal deadline has passed"
        assert 6  <= len(title)    <= 120,  "Title must be 6–120 chars"
        assert 50 <= len(summary)  <= 3000, "Summary must be 50–3000 chars"
        assert 1  <= len(evidence_urls) <= 8, "Must provide 1–8 evidence URLs"
        for url in evidence_urls:
            assert _validate_url(url), f"Invalid URL: {url}"

        p.update({
            "title": title,
            "summary": summary,
            "asset_or_strategy": asset_or_strategy,
            "allocation_bps": allocation_bps,
            "expected_holding_period": expected_holding_period,
            "liquidity_profile": liquidity_profile,
            "risk_thesis": risk_thesis,
            "fundamental_thesis": fundamental_thesis,
            "governance_risks": governance_risks,
            "evidence_urls": evidence_urls,
            "revised_at": _now(),
        })
        self._proposals[str(proposal_id)] = json.dumps(p)

    # ══════════════════════════════════════════════════════════════════════════
    # Evaluation methods  (non-deterministic)
    # ══════════════════════════════════════════════════════════════════════════

    @gl.public.write
    def request_recommendation(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert c["status"] == "proposal_submission_closed", \
            "Proposals must be closed before requesting a recommendation"
        assert _now() >= c["proposal_deadline"], \
            "Cannot request a recommendation before the proposal deadline"

        pid_list = self._proposal_ids_for(committee_id)
        assert len(pid_list) > 0, "No proposals to evaluate"

        # Mark as under review immediately (deterministic state change before nondet)
        c["status"] = "under_consensus_review"
        self._committees[str(committee_id)] = json.dumps(c)

        # Build prompt data from storage before entering non-deterministic block.
        # Storage objects must be read in the deterministic section.
        policy_packet = {
            "dao_name":                      c["dao_name"],
            "treasury_objective":            c["treasury_objective"],
            "risk_appetite":                 c["risk_appetite"],
            "liquidity_requirement":         c["liquidity_requirement"],
            "max_single_asset_exposure_bps": c["max_single_asset_exposure_bps"],
            "max_protocol_exposure_bps":     c["max_protocol_exposure_bps"],
            "allowed_asset_classes":         c["allowed_asset_classes"],
            "disallowed_assets":             c["disallowed_assets"],
            "governance_constraints":        c["governance_constraints"],
        }
        evaluation_weights = c["evaluation_weights"]

        proposal_packets = []
        for pid in pid_list:
            raw = self._proposals.get(str(pid), "")
            if raw != "":
                proposal_packets.append(json.loads(raw))

        prompt = (
            "You are evaluating investment proposals for a DAO Investment Committee.\n"
            "This is NOT a trading signal or price prediction.\n"
            "Identify which proposal BEST SATISFIES the DAO's stated investment policy.\n\n"
            f"DAO policy:\n{json.dumps(policy_packet, indent=2)}\n\n"
            f"Evaluation weights (must sum to 100):\n{json.dumps(evaluation_weights, indent=2)}\n\n"
            f"Submitted proposals:\n{json.dumps(proposal_packets, indent=2)}\n\n"
            "Evaluate each proposal against:\n"
            "1. Treasury objective fit\n"
            "2. Risk limits and risk appetite\n"
            "3. Liquidity requirements\n"
            "4. Fundamentals quality\n"
            "5. Governance risk\n"
            "6. Allocation and concentration limits\n"
            "7. Disallowed asset restrictions\n"
            "8. Evidence URL relevance\n"
            "9. Whether no proposal is suitable (all violate policy)\n"
            "10. Whether proposals are too close to call (tie)\n\n"
            "Weight your scoring according to evaluation_weights.\n\n"
            "Return ONLY a JSON object — no markdown, no extra text:\n"
            "{\n"
            '  "verdict": "proposal_recommended | no_suitable_proposal | tie_detected | '
            'insufficient_evidence | policy_violation_detected | manual_review_required",\n'
            '  "recommended_proposal_id": <integer, or 0 if none>,\n'
            '  "recommended_proposer": "<proposer address or empty string>",\n'
            '  "confidence": <integer 0-100>,\n'
            '  "policy_fit_band": "poor | weak | acceptable | strong | excellent",\n'
            '  "risk_band": "excessive | high | moderate | low | minimal",\n'
            '  "liquidity_band": "illiquid | weak | acceptable | strong | excellent",\n'
            '  "fundamentals_band": "weak | questionable | acceptable | strong | excellent",\n'
            '  "governance_band": "dangerous | weak | acceptable | strong | excellent",\n'
            '  "treasury_objective_fit": "misaligned | weak | acceptable | strong | excellent",\n'
            '  "reason_code": "<short_snake_case>",\n'
            '  "short_reason": "<max 240 chars>",\n'
            '  "appeal_allowed": true\n'
            "}"
        )

        # ── Non-deterministic block ───────────────────────────────────────────
        # The leader calls the LLM and proposes a result.
        # Each validator independently re-runs leader_fn and checks CANONICAL_FIELDS match.
        # Confidence is allowed to vary within one band (low/medium/high).

        def leader_fn():
            raw = gl.nondet.exec_prompt(prompt)
            # Strip markdown code fences if the LLM includes them
            raw = raw.strip()
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:] if len(lines) > 1 else lines)
                if raw.endswith("```"):
                    raw = raw[:-3].strip()
            return json.loads(raw)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader_data = leader_result.calldata
            if not isinstance(leader_data, dict):
                return False

            validator_data = leader_fn()
            if not isinstance(validator_data, dict):
                return False

            # Strict equality on all canonical fields
            for field in CANONICAL_FIELDS:
                if leader_data.get(field) != validator_data.get(field):
                    return False

            # Confidence must be in the same band (low/medium/high)
            l_band = _confidence_band(int(leader_data.get("confidence", 0)))
            v_band = _confidence_band(int(validator_data.get("confidence", 0)))
            return l_band == v_band

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # ── Validate and store ────────────────────────────────────────────────
        assert isinstance(result, dict), "LLM result must be a JSON object"
        assert result.get("verdict") in VALID_VERDICTS, \
            f"Invalid verdict: {result.get('verdict')}"
        assert result.get("policy_fit_band")       in VALID_POLICY_FIT_BANDS,   "Bad policy_fit_band"
        assert result.get("risk_band")             in VALID_RISK_BANDS,          "Bad risk_band"
        assert result.get("liquidity_band")        in VALID_LIQUIDITY_BANDS,     "Bad liquidity_band"
        assert result.get("fundamentals_band")     in VALID_FUNDAMENTALS_BANDS,  "Bad fundamentals_band"
        assert result.get("governance_band")       in VALID_GOVERNANCE_BANDS,    "Bad governance_band"
        assert result.get("treasury_objective_fit") in VALID_OBJECTIVE_BANDS,   "Bad treasury_objective_fit"
        confidence = int(result.get("confidence", -1))
        assert 0 <= confidence <= 100, "Confidence must be 0–100"
        short_reason = str(result.get("short_reason", ""))
        assert len(short_reason) <= 240, "short_reason must be ≤ 240 chars"

        now = _now()
        recommendation = {
            "committee_id":            committee_id,
            "verdict":                 result["verdict"],
            "recommended_proposal_id": result.get("recommended_proposal_id", 0),
            "recommended_proposer":    result.get("recommended_proposer", ""),
            "confidence":              confidence,
            "policy_fit_band":         result["policy_fit_band"],
            "risk_band":               result["risk_band"],
            "liquidity_band":          result["liquidity_band"],
            "fundamentals_band":       result["fundamentals_band"],
            "governance_band":         result["governance_band"],
            "treasury_objective_fit":  result["treasury_objective_fit"],
            "reason_code":             result.get("reason_code", ""),
            "short_reason":            short_reason,
            "appeal_allowed":          bool(result.get("appeal_allowed", True)),
            "issued_at":               now,
        }
        self._recommendations[str(committee_id)] = json.dumps(recommendation)

        appeal_deadline = now + c["appeal_window"]
        c["status"]         = "appeal_window_open"
        c["appeal_deadline"] = appeal_deadline
        self._committees[str(committee_id)] = json.dumps(c)

    @gl.public.write
    def file_appeal(
        self,
        committee_id: int,
        basis: str,
        statement: str,
        evidence_urls: list,
    ) -> None:
        c = self._load_committee(committee_id)
        assert c["status"] == "appeal_window_open", "Committee is not in its appeal window"
        assert _now() < c.get("appeal_deadline", 0), "Appeal window has closed"

        rec_raw = self._recommendations.get(str(committee_id), "")
        assert rec_raw != "", "No recommendation to appeal"
        rec = json.loads(rec_raw)
        assert rec.get("appeal_allowed", False), "Appeal not allowed on this recommendation"
        assert basis in VALID_APPEAL_BASES, f"Invalid appeal basis: {basis}"
        assert len(evidence_urls) <= 8, "Too many evidence URLs (max 8)"
        for url in evidence_urls:
            assert _validate_url(url), f"Invalid URL: {url}"
        assert self._appeals.get(str(committee_id), "") == "", "Appeal already filed"

        self._appeal_counter = u64(int(self._appeal_counter) + 1)
        appeal = {
            "appeal_id":    int(self._appeal_counter),
            "committee_id": committee_id,
            "filed_by":     str(gl.message.sender_address),
            "basis":        basis,
            "statement":    statement,
            "evidence_urls": evidence_urls,
            "status":       "filed",
            "result":       {},
            "created_at":   _now(),
        }
        self._appeals[str(committee_id)] = json.dumps(appeal)

        c["status"] = "appeal_under_review"
        self._committees[str(committee_id)] = json.dumps(c)

    @gl.public.write
    def request_appeal_review(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert c["status"] == "appeal_under_review", "No appeal currently under review"

        appeal_raw = self._appeals.get(str(committee_id), "")
        assert appeal_raw != "", "No appeal found"
        appeal = json.loads(appeal_raw)

        rec_raw = self._recommendations.get(str(committee_id), "")
        assert rec_raw != "", "No original recommendation found"
        rec = json.loads(rec_raw)

        pid_list = self._proposal_ids_for(committee_id)
        proposal_packets = []
        for pid in pid_list:
            raw = self._proposals.get(str(pid), "")
            if raw != "":
                proposal_packets.append(json.loads(raw))

        policy_packet = {
            "dao_name":                      c["dao_name"],
            "treasury_objective":            c["treasury_objective"],
            "risk_appetite":                 c["risk_appetite"],
            "liquidity_requirement":         c["liquidity_requirement"],
            "max_single_asset_exposure_bps": c["max_single_asset_exposure_bps"],
            "allowed_asset_classes":         c["allowed_asset_classes"],
            "disallowed_assets":             c["disallowed_assets"],
            "governance_constraints":        c["governance_constraints"],
        }

        prompt = (
            "You are reviewing an appeal against a DAO Investment Committee recommendation.\n\n"
            f"Original recommendation:\n{json.dumps(rec, indent=2)}\n\n"
            f"Appeal basis: {appeal['basis']}\n"
            f"Appeal statement: {appeal['statement']}\n"
            f"Appeal evidence URLs: {json.dumps(appeal['evidence_urls'])}\n\n"
            f"DAO policy:\n{json.dumps(policy_packet, indent=2)}\n\n"
            f"All submitted proposals:\n{json.dumps(proposal_packets, indent=2)}\n\n"
            "Evaluate:\n"
            "1. Does the appeal introduce meaningful new evidence?\n"
            "2. Was risk interpreted incorrectly?\n"
            "3. Was liquidity misread?\n"
            "4. Was governance risk overlooked?\n"
            "5. Was the DAO policy misapplied?\n"
            "6. Should the recommendation change?\n\n"
            f"The appeal basis '{appeal['basis']}' must be given careful weight.\n\n"
            "Return ONLY a JSON object — no markdown, no extra text:\n"
            "{\n"
            '  "appeal_verdict": "appeal_granted | appeal_rejected | manual_review_required",\n'
            '  "final_recommendation_changed": <true or false>,\n'
            '  "new_recommended_proposal_id": <proposal_id or 0 if unchanged>,\n'
            '  "confidence": <integer 0-100>,\n'
            '  "reason_code": "<short_snake_case>",\n'
            '  "short_reason": "<max 240 chars>"\n'
            "}"
        )

        # ── Non-deterministic appeal review ───────────────────────────────────
        def leader_fn():
            raw = gl.nondet.exec_prompt(prompt)
            raw = raw.strip()
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:] if len(lines) > 1 else lines)
                if raw.endswith("```"):
                    raw = raw[:-3].strip()
            return json.loads(raw)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader_data = leader_result.calldata
            if not isinstance(leader_data, dict):
                return False
            validator_data = leader_fn()
            if not isinstance(validator_data, dict):
                return False
            # appeal_verdict and changed flag must agree; new proposal must agree if changed
            if leader_data.get("appeal_verdict") != validator_data.get("appeal_verdict"):
                return False
            if leader_data.get("final_recommendation_changed") != validator_data.get("final_recommendation_changed"):
                return False
            if leader_data.get("final_recommendation_changed"):
                if leader_data.get("new_recommended_proposal_id") != validator_data.get("new_recommended_proposal_id"):
                    return False
            return True

        appeal_result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        assert isinstance(appeal_result, dict), "Appeal result must be a JSON object"
        assert appeal_result.get("appeal_verdict") in {
            "appeal_granted", "appeal_rejected", "manual_review_required"
        }, f"Invalid appeal_verdict: {appeal_result.get('appeal_verdict')}"

        appeal["result"] = appeal_result
        appeal["status"] = "reviewed"
        self._appeals[str(committee_id)] = json.dumps(appeal)

        # If the appeal is granted and the recommendation changed, update it
        if (
            appeal_result.get("appeal_verdict") == "appeal_granted"
            and appeal_result.get("final_recommendation_changed")
        ):
            new_pid = int(appeal_result.get("new_recommended_proposal_id", 0))
            new_proposer = ""
            if new_pid > 0:
                np_raw = self._proposals.get(str(new_pid), "")
                if np_raw != "":
                    new_proposer = json.loads(np_raw).get("proposer", "")
            rec.update({
                "verdict":                 "proposal_recommended" if new_pid > 0 else "no_suitable_proposal",
                "recommended_proposal_id": new_pid,
                "recommended_proposer":    new_proposer,
                "confidence":              int(appeal_result.get("confidence", 0)),
                "reason_code":             appeal_result.get("reason_code", ""),
                "short_reason":            appeal_result.get("short_reason", ""),
            })
            self._recommendations[str(committee_id)] = json.dumps(rec)

        c["status"] = "recommendation_issued"
        self._committees[str(committee_id)] = json.dumps(c)

    @gl.public.write
    def finalize_recommendation(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert c["status"] in {"appeal_window_open", "recommendation_issued"}, \
            "Committee must have a recommendation before finalising"
        assert self._recommendations.get(str(committee_id), "") != "", \
            "No recommendation to finalise"
        if c["status"] == "appeal_window_open":
            assert _now() >= c.get("appeal_deadline", 0), "Appeal window has not closed yet"
        c["status"]   = "finalized"
        c["finalized"] = True
        self._committees[str(committee_id)] = json.dumps(c)

    # ══════════════════════════════════════════════════════════════════════════
    # Read methods
    # ══════════════════════════════════════════════════════════════════════════

    @gl.public.view
    def get_committee(self, committee_id: int) -> dict:
        return self._load_committee(committee_id)

    @gl.public.view
    def get_proposal(self, proposal_id: int) -> dict:
        return self._load_proposal(proposal_id)

    @gl.public.view
    def get_committee_proposals(self, committee_id: int) -> list:
        result = []
        for pid in self._proposal_ids_for(committee_id):
            raw = self._proposals.get(str(pid), "")
            if raw != "":
                result.append(json.loads(raw))
        return result

    @gl.public.view
    def get_recommendation_result(self, committee_id: int) -> dict:
        raw = self._recommendations.get(str(committee_id), "")
        assert raw != "", f"No recommendation for committee {committee_id}"
        return json.loads(raw)

    @gl.public.view
    def get_appeal(self, committee_id: int) -> dict:
        raw = self._appeals.get(str(committee_id), "")
        assert raw != "", f"No appeal for committee {committee_id}"
        return json.loads(raw)

    @gl.public.view
    def get_committees_by_dao(self, address: str) -> list:
        cids = json.loads(self._committees_by_dao.get(address, "[]"))
        result = []
        for cid in cids:
            raw = self._committees.get(str(cid), "")
            if raw != "":
                result.append(json.loads(raw))
        return result

    @gl.public.view
    def get_proposals_by_proposer(self, address: str) -> list:
        pids = json.loads(self._proposals_by_proposer.get(address, "[]"))
        result = []
        for pid in pids:
            raw = self._proposals.get(str(pid), "")
            if raw != "":
                result.append(json.loads(raw))
        return result

    @gl.public.view
    def get_all_committees(self) -> list:
        result = []
        cid = 1
        while cid <= int(self._committee_counter):
            raw = self._committees.get(str(cid), "")
            if raw != "":
                result.append(json.loads(raw))
            cid += 1
        return result
