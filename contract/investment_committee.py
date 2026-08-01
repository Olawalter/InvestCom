# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from datetime import datetime, timezone
import json

# ---- Valid enum sets -------------------------------------------------------

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

# Fields that must agree between leader and validator.
# Free-form text fields are excluded; independent LLM calls produce different
# phrasing but should agree on the structured outcome.
CANONICAL_FIELDS = [
    "verdict",
    "recommended_proposal_id",
]


# ---- Helpers ---------------------------------------------------------------

def _now() -> int:
    # GenVM pins datetime.now() to the transaction timestamp -- deterministic
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


def _normalise_addr(addr) -> str:
    """Return a canonical lowercase 0x-prefixed address string.

    GenLayer's str(gl.message.sender_address) format may vary between
    runtimes (checksummed vs lowercase, with or without 0x prefix).
    Normalising before storage ensures all index lookups are consistent
    regardless of what the validator node or test runner produces.
    """
    s = str(addr).strip().lower()
    if not s.startswith("0x"):
        s = "0x" + s
    return s


# ---- Contract --------------------------------------------------------------

class InvestmentCommitteeProtocol(gl.Contract):
    # Counters
    _committee_counter: u64
    _proposal_counter:  u64
    _appeal_counter:    u64

    # Primary storage: entity blobs as JSON strings
    _committees:      TreeMap[str, str]   # str(committee_id) -> JSON
    _proposals:       TreeMap[str, str]   # str(proposal_id)  -> JSON
    _recommendations: TreeMap[str, str]   # str(committee_id) -> JSON
    _appeals:         TreeMap[str, str]   # str(committee_id) -> JSON

    # Index maps (keys are always normalised addresses)
    _committees_by_dao:      TreeMap[str, str]  # normalised dao addr  -> JSON list of cids
    _proposals_by_committee: TreeMap[str, str]  # str(cid)             -> JSON list of pids
    _proposals_by_proposer:  TreeMap[str, str]  # normalised proposer  -> JSON list of pids

    def __init__(self) -> None:
        self._committee_counter = u64(0)
        self._proposal_counter  = u64(0)
        self._appeal_counter    = u64(0)

    # ---- Internal loaders --------------------------------------------------

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

    # =========================================================================
    # Committee methods
    # =========================================================================

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
        assert 3  <= len(dao_name)           <= 80,   "DAO name must be 3-80 chars"
        assert 30 <= len(treasury_objective) <= 2000, "Treasury objective must be 30-2000 chars"
        assert risk_appetite in VALID_RISK_APPETITES,  f"Invalid risk appetite: {risk_appetite}"
        assert 20 <= len(liquidity_requirement) <= 1000, "Liquidity requirement must be 20-1000 chars"
        assert _validate_weights(evaluation_weights), "Evaluation weights must sum to 100"
        assert proposal_deadline > _now(), "Proposal deadline must be in the future"
        assert appeal_window > 0,          "Appeal window must be positive (seconds)"

        self._committee_counter = u64(int(self._committee_counter) + 1)
        cid = int(self._committee_counter)
        dao = _normalise_addr(gl.message.sender_address)

        committee = {
            "committee_id":                  cid,
            "dao":                           dao,
            "dao_name":                      dao_name,
            "treasury_objective":            treasury_objective,
            "risk_appetite":                 risk_appetite,
            "liquidity_requirement":         liquidity_requirement,
            "max_single_asset_exposure_bps": max_single_asset_exposure_bps,
            "max_protocol_exposure_bps":     max_protocol_exposure_bps,
            "allowed_asset_classes":         allowed_asset_classes,
            "disallowed_assets":             disallowed_assets,
            "governance_constraints":        governance_constraints,
            "evaluation_weights":            evaluation_weights,
            "proposal_deadline":             proposal_deadline,
            "appeal_window":                 appeal_window,
            "appeal_deadline":               0,
            "status":                        "draft",
            "created_at":                    _now(),
            "finalized":                     False,
        }
        self._committees[str(cid)] = json.dumps(committee)

        existing = json.loads(self._committees_by_dao.get(dao, "[]"))
        existing.append(cid)
        self._committees_by_dao[dao] = json.dumps(existing)

        self._proposals_by_committee[str(cid)] = "[]"
        return cid

    @gl.public.write
    def open_committee(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert _normalise_addr(gl.message.sender_address) == c["dao"], \
            "Only the DAO may open this committee"
        assert c["status"] == "draft", "Committee must be in draft status"
        c["status"] = "open_for_proposals"
        self._committees[str(committee_id)] = json.dumps(c)

    @gl.public.write
    def close_proposals(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert _normalise_addr(gl.message.sender_address) == c["dao"], \
            "Only the DAO may close proposals"
        assert c["status"] == "open_for_proposals", "Committee must be open for proposals"
        assert len(self._proposal_ids_for(committee_id)) > 0, "No proposals submitted yet"
        c["status"] = "proposal_submission_closed"
        self._committees[str(committee_id)] = json.dumps(c)

    @gl.public.write
    def cancel_committee(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert _normalise_addr(gl.message.sender_address) == c["dao"], \
            "Only the DAO may cancel"
        assert c["status"] not in {"finalized", "cancelled"}, \
            "Cannot cancel a finalised committee"
        c["status"] = "cancelled"
        self._committees[str(committee_id)] = json.dumps(c)

    # =========================================================================
    # Proposal methods
    # =========================================================================

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
        assert _now() < c["proposal_deadline"],    "Proposal deadline has passed"
        assert 6  <= len(title)              <= 120,  "Title must be 6-120 chars"
        assert 50 <= len(summary)            <= 3000, "Summary must be 50-3000 chars"
        assert 50 <= len(risk_thesis)        <= 3000, "Risk thesis must be 50-3000 chars"
        assert 50 <= len(fundamental_thesis) <= 3000, "Fundamental thesis must be 50-3000 chars"
        assert 30 <= len(governance_risks)   <= 2000, "Governance risks must be 30-2000 chars"
        assert len(liquidity_profile) >= 1,           "Liquidity profile cannot be empty"
        assert 1 <= len(evidence_urls) <= 8,          "Must provide 1-8 evidence URLs"
        for url in evidence_urls:
            assert _validate_url(url), f"Invalid URL: {url}"
        assert allocation_bps <= c["max_single_asset_exposure_bps"], \
            f"Allocation exceeds max single asset exposure ({c['max_single_asset_exposure_bps']} bps)"

        self._proposal_counter = u64(int(self._proposal_counter) + 1)
        pid      = int(self._proposal_counter)
        proposer = _normalise_addr(gl.message.sender_address)
        now      = _now()

        proposal = {
            "proposal_id":             pid,
            "committee_id":            committee_id,
            "proposer":                proposer,
            "title":                   title,
            "summary":                 summary,
            "asset_or_strategy":       asset_or_strategy,
            "allocation_bps":          allocation_bps,
            "expected_holding_period": expected_holding_period,
            "liquidity_profile":       liquidity_profile,
            "risk_thesis":             risk_thesis,
            "fundamental_thesis":      fundamental_thesis,
            "governance_risks":        governance_risks,
            "evidence_urls":           evidence_urls,
            "submitted_at":            now,
            "revised_at":              now,
            "status":                  "submitted",
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
        assert p["proposer"] == _normalise_addr(gl.message.sender_address), \
            "Only the proposer may revise"
        c = self._load_committee(p["committee_id"])
        assert c["status"] == "open_for_proposals", \
            "Revision only allowed while committee is open"
        assert _now() < c["proposal_deadline"], "Proposal deadline has passed"
        assert 6  <= len(title)   <= 120,  "Title must be 6-120 chars"
        assert 50 <= len(summary) <= 3000, "Summary must be 50-3000 chars"
        assert 1 <= len(evidence_urls) <= 8, "Must provide 1-8 evidence URLs"
        for url in evidence_urls:
            assert _validate_url(url), f"Invalid URL: {url}"

        p.update({
            "title":                   title,
            "summary":                 summary,
            "asset_or_strategy":       asset_or_strategy,
            "allocation_bps":          allocation_bps,
            "expected_holding_period": expected_holding_period,
            "liquidity_profile":       liquidity_profile,
            "risk_thesis":             risk_thesis,
            "fundamental_thesis":      fundamental_thesis,
            "governance_risks":        governance_risks,
            "evidence_urls":           evidence_urls,
            "revised_at":              _now(),
        })
        self._proposals[str(proposal_id)] = json.dumps(p)

    # =========================================================================
    # Evaluation methods  (non-deterministic)
    # =========================================================================

    @gl.public.write
    def request_recommendation(self, committee_id: int) -> None:
        c = self._load_committee(committee_id)
        assert c["status"] == "proposal_submission_closed", \
            "Proposals must be closed before requesting a recommendation"
        assert _now() >= c["proposal_deadline"], \
            "Cannot request a recommendation before the proposal deadline"

        pid_list = self._proposal_ids_for(committee_id)
        assert len(pid_list) > 0, "No proposals to evaluate"

        # Mark as under review before entering the non-deterministic block
        c["status"] = "under_consensus_review"
        self._committees[str(committee_id)] = json.dumps(c)

        # Read all data from storage in the deterministic section
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

        # ---- Non-deterministic block ----------------------------------------
        # Leader calls web + LLM. Each validator independently re-runs leader_fn
        # and verifies that CANONICAL_FIELDS agree before signing the result.

        def leader_fn():
            # Fetch live evidence for each proposal (cap at 2 URLs to limit latency)
            enriched = []
            for p in proposal_packets:
                ep = dict(p)
                live_evidence = []
                for url in p.get('evidence_urls', [])[:2]:
                    try:
                        text = gl.nondet.web.render(url, mode='text')
                        live_evidence.append({
                            "url": url,
                            "content": (text or "")[:1200],
                        })
                    except Exception:
                        live_evidence.append({
                            "url": url,
                            "content": "FETCH_UNAVAILABLE",
                        })
                ep['live_evidence'] = live_evidence
                enriched.append(ep)

            prompt = (
                "You are evaluating investment proposals for a DAO treasury committee.\n"
                "This is a POLICY EVALUATION -- not a price forecast or trading signal.\n\n"
                f"DAO Policy:\n{json.dumps(policy_packet, indent=2)}\n\n"
                f"Evaluation weights (sum to 100):\n{json.dumps(evaluation_weights, indent=2)}\n\n"
                "Proposals (with live evidence fetched from each proposal's evidence_urls):\n"
                f"{json.dumps(enriched, indent=2)}\n\n"
                "Follow these steps EXACTLY IN ORDER:\n\n"
                "STEP 1 — Hard disqualification (check each proposal):\n"
                "  - If a proposal lists an asset present in disallowed_assets: DISQUALIFY it.\n"
                "  - If a proposal's allocation_bps > max_single_asset_exposure_bps: DISQUALIFY it.\n"
                "  - If a proposal's asset_or_strategy mentions any disallowed asset type: DISQUALIFY it.\n\n"
                "STEP 2 — Score each remaining (non-disqualified) proposal 0-100:\n"
                "  Use the evaluation_weights to weight these five dimensions:\n"
                "  - risk (default 30): Does risk_thesis match the stated risk_appetite? "
                "Are risks mitigated?\n"
                "  - liquidity (default 25): Does liquidity_profile guarantee the stated "
                "liquidity_requirement? Count only verified withdrawal mechanisms.\n"
                "  - fundamentals (default 20): Quality of fundamental_thesis, "
                "cross-checked against live_evidence. FETCH_UNAVAILABLE reduces this score.\n"
                "  - governance (default 15): Is the team identified and KYC-verified? "
                "Are audits present and recent?\n"
                "  - treasury_objective_fit (default 10): How directly does this strategy "
                "serve the treasury_objective?\n"
                "  Compute each dimension as a 0-100 score, then: "
                "total = sum(score_i * weight_i / 100).\n\n"
                "STEP 3 — Select verdict using these rules (apply in order, stop at first match):\n"
                "  a. If ALL proposals were DISQUALIFIED in Step 1: "
                'verdict="policy_violation_detected", recommended_proposal_id=0\n'
                "  b. If no proposal scores >= 35 after weighting: "
                'verdict="no_suitable_proposal", recommended_proposal_id=0\n'
                "  c. If there are >= 2 proposals and the top-2 weighted scores differ "
                "by <= 5 points (both >= 35): "
                'verdict="tie_detected", recommended_proposal_id=0\n'
                "  d. If ONE proposal has the highest weighted score (>= 35) and leads "
                "the next by > 5 points: "
                'verdict="proposal_recommended", recommended_proposal_id=<that proposal\'s proposal_id>\n'
                "  e. If evidence is entirely FETCH_UNAVAILABLE for all proposals: "
                'verdict="insufficient_evidence", recommended_proposal_id=0\n'
                "  f. If none of the above apply: "
                'verdict="manual_review_required", recommended_proposal_id=0\n\n'
                "Return ONLY a JSON object (no markdown, no extra text):\n"
                '{"verdict":"<from step 3>",'
                '"recommended_proposal_id":<int, 0 if none>,'
                '"recommended_proposer":"<proposer address of winning proposal, or empty>",'
                '"confidence":<int 0-100, your certainty in this verdict>,'
                '"policy_fit_band":"poor|weak|acceptable|strong|excellent",'
                '"risk_band":"excessive|high|moderate|low|minimal",'
                '"liquidity_band":"illiquid|weak|acceptable|strong|excellent",'
                '"fundamentals_band":"weak|questionable|acceptable|strong|excellent",'
                '"governance_band":"dangerous|weak|acceptable|strong|excellent",'
                '"treasury_objective_fit":"misaligned|weak|acceptable|strong|excellent",'
                '"reason_code":"<short_snake_case_label>",'
                '"short_reason":"<one sentence, max 240 chars>",'
                '"appeal_allowed":true}'
            )

            result = gl.nondet.exec_prompt(prompt, response_format='json')
            if not isinstance(result, dict):
                raise gl.vm.UserError("LLM_ERROR: evaluator did not return a JSON object")
            return result

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader_data = leader_result.calldata
            if not isinstance(leader_data, dict):
                return False
            try:
                validator_data = leader_fn()
            except Exception:
                return False
            if not isinstance(validator_data, dict):
                return False
            for field in CANONICAL_FIELDS:
                if leader_data.get(field) != validator_data.get(field):
                    return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # ---- Validate and store --------------------------------------------
        assert isinstance(result, dict), "LLM result must be a JSON object"
        assert result.get("verdict") in VALID_VERDICTS, \
            f"Invalid verdict: {result.get('verdict')}"
        assert result.get("policy_fit_band")        in VALID_POLICY_FIT_BANDS,   "Bad policy_fit_band"
        assert result.get("risk_band")              in VALID_RISK_BANDS,          "Bad risk_band"
        assert result.get("liquidity_band")         in VALID_LIQUIDITY_BANDS,     "Bad liquidity_band"
        assert result.get("fundamentals_band")      in VALID_FUNDAMENTALS_BANDS,  "Bad fundamentals_band"
        assert result.get("governance_band")        in VALID_GOVERNANCE_BANDS,    "Bad governance_band"
        assert result.get("treasury_objective_fit") in VALID_OBJECTIVE_BANDS,     "Bad treasury_objective_fit"
        confidence = int(result.get("confidence", -1))
        assert 0 <= confidence <= 100, "Confidence must be 0-100"
        short_reason = str(result.get("short_reason", ""))
        assert len(short_reason) <= 240, "short_reason must be <= 240 chars"

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
            "appeal_id":     int(self._appeal_counter),
            "committee_id":  committee_id,
            "filed_by":      _normalise_addr(gl.message.sender_address),
            "basis":         basis,
            "statement":     statement,
            "evidence_urls": evidence_urls,
            "status":        "filed",
            "result":        {},
            "created_at":    _now(),
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

        appeal_basis = appeal['basis']
        appeal_stmt  = appeal['statement']
        appeal_urls  = appeal['evidence_urls']

        def leader_fn():
            # Fetch new evidence submitted with the appeal
            appeal_evidence = []
            for url in appeal_urls[:2]:
                try:
                    text = gl.nondet.web.render(url, mode='text')
                    appeal_evidence.append({
                        "url": url,
                        "content": (text or "")[:1200],
                    })
                except Exception:
                    appeal_evidence.append({
                        "url": url,
                        "content": "FETCH_UNAVAILABLE",
                    })

            prompt = (
                "You are reviewing an appeal against a DAO Investment Committee recommendation.\n\n"
                f"Original recommendation:\n{json.dumps(rec, indent=2)}\n\n"
                f"Appeal basis: {appeal_basis}\n"
                f"Appeal statement: {appeal_stmt}\n\n"
                "Appeal evidence (fetched from submitted URLs):\n"
                f"{json.dumps(appeal_evidence, indent=2)}\n\n"
                f"DAO policy:\n{json.dumps(policy_packet, indent=2)}\n\n"
                f"All submitted proposals:\n{json.dumps(proposal_packets, indent=2)}\n\n"
                "Follow these steps EXACTLY IN ORDER:\n\n"
                "STEP 1 — Determine if the appeal introduces material new substance:\n"
                f"  The appeal basis is '{appeal_basis}'.\n"
                "  Check: does the appeal statement or fetched appeal_evidence raise a "
                "specific factual argument that was NOT considered in the original recommendation?\n"
                "  - If NO material new argument exists: proceed to STEP 3a.\n"
                "  - If YES material new argument exists: proceed to STEP 2.\n\n"
                "STEP 2 — Re-evaluate the specific policy criterion named by the appeal_basis:\n"
                "  - liquidity_misread: Re-check the liquidity_profile of the recommended "
                "proposal strictly against liquidity_requirement. Does it meet it under "
                "conservative (stress) conditions, not just average conditions?\n"
                "  - fundamental_misread: Re-verify fundamental claims against live evidence.\n"
                "  - governance_risk_misread: Re-check team identification, audits, and "
                "governance structure.\n"
                "  - policy_constraint_misapplied: Re-apply the specific constraint "
                "(allocation limits, allowed assets, etc.).\n"
                "  - new_risk_evidence: Evaluate the new risk argument from the appeal.\n"
                "  - For any other basis: re-evaluate the relevant criterion carefully.\n"
                "  After re-evaluation, determine: does the original recommendation still hold?\n\n"
                "STEP 3 — Select verdict using these rules (apply in order, stop at first match):\n"
                "  a. If the appeal introduces no material new argument: "
                'appeal_verdict="appeal_rejected", final_recommendation_changed=false, '
                "new_recommended_proposal_id=0\n"
                "  b. If re-evaluation confirms the original recommendation is correct "
                "(the appeal argument fails on the merits): "
                'appeal_verdict="appeal_rejected", final_recommendation_changed=false, '
                "new_recommended_proposal_id=0\n"
                "  c. If re-evaluation shows the original recommendation should change "
                "to a different proposal: "
                'appeal_verdict="appeal_granted", final_recommendation_changed=true, '
                "new_recommended_proposal_id=<the correct proposal's proposal_id>\n"
                "  d. If re-evaluation shows the original recommendation should be "
                "withdrawn (no suitable proposal): "
                'appeal_verdict="appeal_granted", final_recommendation_changed=true, '
                "new_recommended_proposal_id=0\n"
                "  e. If the appeal raises a genuinely unresolvable ambiguity: "
                'appeal_verdict="manual_review_required", final_recommendation_changed=false, '
                "new_recommended_proposal_id=0\n\n"
                "Return ONLY a JSON object (no markdown, no extra text):\n"
                '{"appeal_verdict":"appeal_granted|appeal_rejected|manual_review_required",'
                '"final_recommendation_changed":<true or false>,'
                '"new_recommended_proposal_id":<proposal_id or 0>,'
                '"confidence":<int 0-100>,'
                '"reason_code":"<short_snake_case_label>",'
                '"short_reason":"<one sentence, max 240 chars>"}'
            )

            result = gl.nondet.exec_prompt(prompt, response_format='json')
            if not isinstance(result, dict):
                raise gl.vm.UserError("LLM_ERROR: appeal reviewer did not return a JSON object")
            return result

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader_data = leader_result.calldata
            if not isinstance(leader_data, dict):
                return False
            try:
                validator_data = leader_fn()
            except Exception:
                return False
            if not isinstance(validator_data, dict):
                return False
            # Canonical check: did the recommendation change, and if so to which proposal?
            # These are the binary outcomes the DAO acts on. appeal_verdict label
            # (granted/rejected) is derived from final_recommendation_changed anyway.
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

    # =========================================================================
    # Read methods
    # =========================================================================

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
        norm = _normalise_addr(address)
        cids = json.loads(self._committees_by_dao.get(norm, "[]"))
        result = []
        for cid in cids:
            raw = self._committees.get(str(cid), "")
            if raw != "":
                result.append(json.loads(raw))
        return result

    @gl.public.view
    def get_proposals_by_proposer(self, address: str) -> list:
        norm = _normalise_addr(address)
        pids = json.loads(self._proposals_by_proposer.get(norm, "[]"))
        result = []
        for pid in pids:
            raw = self._proposals.get(str(pid), "")
            if raw != "":
                result.append(json.loads(raw))
        return result

    @gl.public.view
    def get_committee_count(self) -> int:
        return int(self._committee_counter)

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
