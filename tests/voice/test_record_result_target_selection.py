"""Offline regression tests for unambiguous result targets."""

import unittest
from unittest.mock import Mock, patch
from urllib.error import URLError

from senaite.client import SenaiteClient
from voice import commands


class RecordResultTargetSelectionTests(unittest.TestCase):
    def setUp(self):
        self.client = SenaiteClient("https://example.invalid", "fixture", "fixture")
        for name, response in (
            ("get_sample", {"uid": "sample-uid"}),
            ("get", {"items": []}),
            ("post", {"success": True}),
        ):
            mock = patch.object(self.client, name, return_value=response)
            setattr(self, name, mock.start())
            self.addCleanup(mock.stop)

    def test_zero_matches_preserves_not_found_error_without_writing(self):
        with self.assertRaises(ValueError) as caught:
            self.client.record_result("SA-001", "pH", "7")
        self.assertEqual(str(caught.exception), "Test 'pH' not found on sample SA-001")
        self.post.assert_not_called()

    def test_multiple_distinct_matches_rejected_without_writing(self):
        self.get.return_value = {"items": [{"uid": "analysis-1"}, {"uid": "analysis-2"}]}
        with self.assertRaisesRegex(ValueError, "Multiple analyses match test 'pH'"):
            self.client.record_result("SA-001", "pH", "7")
        self.post.assert_not_called()

    def test_malformed_sole_target_rejected_without_writing(self):
        for target in ({}, {"uid": None}, {"uid": ""}, {"uid": " \t"},
                       {"uid": 123}, {"uid": False}, {"uid": []}, None, "analysis-1"):
            with self.subTest(target=target):
                self.get.return_value = {"items": [target]}
                with self.assertRaisesRegex(ValueError, "has an invalid UID"):
                    self.client.record_result("SA-001", "pH", "7")
                self.post.assert_not_called()

    def test_sole_match_from_another_sample_rejected_without_writing(self):
        # What SENAITE returns if the sample filter is ignored and one other
        # sample in the lab happens to carry the only matching analysis.
        for parent_uid in ("other-sample-uid", None, "", "SAMPLE-UID", ["sample-uid"]):
            with self.subTest(parent_uid=parent_uid):
                target = {"uid": "analysis-1"}
                if parent_uid is not None:
                    target["parent_uid"] = parent_uid
                self.get.return_value = {"items": [target]}
                with self.assertRaisesRegex(ValueError, "does not belong to sample SA-001"):
                    self.client.record_result("SA-001", "pH", "7")
                self.post.assert_not_called()

    def test_one_valid_match_preserves_endpoint_and_result_body(self):
        self.get.return_value = {"items": [{"uid": "analysis-1", "parent_uid": "sample-uid"}]}
        value = "12.3 + & # µg/L"
        response = self.client.record_result("SA-001", "pH", value)
        self.get_sample.assert_called_once_with("SA-001")
        self.get.assert_called_once_with("Analysis?getParentUID=sample-uid&getKeyword=pH")
        self.post.assert_called_once_with("Analysis/analysis-1", {"Result": value})
        self.assertIs(response, self.post.return_value)


class RecordResultFeedbackTests(unittest.TestCase):
    affirmative = "Result 7 recorded for pH on sample SYNTH-A."

    def setUp(self):
        session_patch = patch.object(commands, "session", commands.SessionContext())
        session_patch.start()
        self.addCleanup(session_patch.stop)
        commands.session.set_sample("SYNTH-A", "synthetic-uid")
        self.client = Mock(spec=SenaiteClient)

    def execute(self):
        feedback = commands.execute_command("record_result", ("7", "pH"), self.client)
        self.client.record_result.assert_called_once_with("SYNTH-A", "pH", "7")
        self.assertEqual(commands.session.current_sample_id, "SYNTH-A")
        self.assertEqual(commands.session.current_sample_uid, "synthetic-uid")
        return feedback

    def assert_unconfirmed(self, response):
        self.client.record_result.reset_mock()
        self.client.record_result.return_value = response
        feedback = self.execute()
        self.assertIn("was not confirmed", feedback)
        self.assertNotIn(self.affirmative, feedback)

    def test_explicit_rejection(self):
        for response in ({"success": False, "error": "synthetic rejection"},
                         {"success": False}, {"error": "synthetic rejection"}):
            with self.subTest(response=response):
                self.assert_unconfirmed(response)

    def test_success_with_error_is_unconfirmed(self):
        self.assert_unconfirmed({"success": True, "error": "synthetic rejection"})

    def test_missing_confirmation(self):
        for response in ({}, {"Result": "7"}, {"items": []}):
            with self.subTest(response=response):
                self.assert_unconfirmed(response)

    def test_malformed_body_or_confirmation(self):
        for response in (None, [], [{"success": True}], "success", True, 1,
                         {"success": "true"}, {"success": 1}, {"success": None},
                         {"success": [True]}):
            with self.subTest(response=response):
                self.assert_unconfirmed(response)

    def test_explicit_success(self):
        self.client.record_result.return_value = {"success": True}
        self.assertEqual(self.execute(), self.affirmative)

    def test_transport_failure_keeps_executor_error_handling(self):
        error = URLError("synthetic transport failure")
        self.client.record_result.side_effect = error
        with self.assertLogs("voice.commands", level="ERROR"):
            feedback = self.execute()
        self.assertEqual(feedback, f"Error executing command: {error}")
        self.assertNotIn(self.affirmative, feedback)

    def test_target_error_keeps_handler_feedback(self):
        self.client.record_result.side_effect = ValueError("synthetic target error")
        self.assertEqual(self.execute(), "synthetic target error")


if __name__ == "__main__":
    unittest.main()
