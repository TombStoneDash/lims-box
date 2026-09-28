"""Offline regression tests for unambiguous start-test target selection."""

import unittest
from unittest.mock import Mock, patch

from voice import commands


class StartTestTargetSelectionTests(unittest.TestCase):
    def execute(self, items):
        client = Mock(spec=["get_sample", "get", "post", "transition_sample"])
        client.get_sample.return_value = {"uid": "sample-uid"}
        client.get.return_value = {"items": items}
        context = commands.SessionContext()
        context.set_sample("SA-2026-001", "cached-uid")

        with patch.object(commands, "session", context):
            feedback = commands.execute_command("start_test", ("pH",), client)

        client.get_sample.assert_called_once_with("SA-2026-001")
        client.get.assert_called_once_with(
            "Analysis?getParentUID=sample-uid&getKeyword=pH"
        )
        client.post.assert_not_called()
        client.transition_sample.assert_not_called()
        self.assertEqual(context.current_sample_id, "SA-2026-001")
        self.assertEqual(context.current_sample_uid, "cached-uid")
        return feedback

    def assert_ambiguous(self, items):
        self.assertEqual(
            self.execute(items),
            "Test 'pH' is ambiguous on sample SA-2026-001: "
            "multiple matching analyses were found. No workflow change was made.",
        )

    def test_different_states_are_ambiguous_in_both_orders(self):
        verified = {"uid": "analysis-1", "review_state": "verified"}
        received = {"uid": "analysis-2", "review_state": "sample_received"}
        for items in ([verified, received], [received, verified]):
            with self.subTest(items=items):
                self.assert_ambiguous(items)

    def test_same_state_matches_are_ambiguous(self):
        for state in ("verified", "published", "sample_received"):
            with self.subTest(state=state):
                self.assert_ambiguous([
                    {"uid": "analysis-1", "review_state": state},
                    {"uid": "analysis-2", "review_state": state},
                ])

    def test_duplicate_entries_are_ambiguous(self):
        analysis = {"uid": "analysis-1", "review_state": "verified"}
        self.assert_ambiguous([analysis, analysis])

    def test_one_match_preserves_observed_state_feedback(self):
        self.assertEqual(
            self.execute([{"review_state": "sample_received"}]),
            "Test pH found on sample SA-2026-001. "
            "Observed state: sample_received. No workflow change was made.",
        )

    def test_one_match_preserves_verified_and_published_feedback(self):
        for state in ("verified", "published"):
            with self.subTest(state=state):
                self.assertEqual(
                    self.execute([{"review_state": state}]),
                    f"Test pH is already {state}.",
                )

    def test_one_match_without_review_state_is_unknown(self):
        self.assertEqual(
            self.execute([{}]),
            "Test pH found on sample SA-2026-001. "
            "Observed state: unknown. No workflow change was made.",
        )

    def test_no_match_preserves_feedback(self):
        self.assertEqual(
            self.execute([]),
            "Test 'pH' is not configured on sample SA-2026-001.",
        )


if __name__ == "__main__":
    unittest.main()
