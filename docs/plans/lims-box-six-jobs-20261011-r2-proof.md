# Reproduction evidence

Run from the assigned repository root, at base `351676fdab0d1284f31f9a6603ae3c1342292798`. These probes assert current defective behavior; they are not proposed regression expectations. They were executed against unchanged source, with synthetic inputs and no external requests.

## Voice: three assertions

```sh
PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY'
from unittest.mock import Mock, patch
from voice import commands
from senaite.client import SenaiteClient
ctx = commands.SessionContext()
ctx.set_sample('SYNTH-A', 'uid-a')
with patch.object(commands, 'session', ctx):
    client = Mock()
    client.record_result.return_value = {'success': False, 'error': 'synthetic rejection'}
    out = commands.execute_command('record_result', ('7', 'pH'), client)
    assert out == 'Result 7 recorded for pH on sample SYNTH-A.'
    print('JOB 1 reproduced:', out)
    client.get_sample.return_value = {'uid': 'uid-a', 'api_url': 'https://example.invalid/sample'}
    client.post.return_value = {'success': False, 'error': 'synthetic printer rejection'}
    out = commands.execute_command('print_label', ('SYNTH-A',), client)
    assert out == 'Label print request accepted for sample SYNTH-A.'
    print('JOB 2 reproduced:', out)
client = SenaiteClient('https://example.invalid', 'fixture', 'fixture')
with patch.object(client, 'search_samples', return_value=[{'uid': 'uid-b', 'getId': 'SYNTH-B'}]), patch.object(client, 'post', return_value={'success': True}) as post:
    client.transition_sample('SYNTH-A', 'submit')
    post.assert_called_once_with('AnalysisRequest/uid-b/transition/submit', {})
    print('JOB 3 reproduced: requested SYNTH-A; would submit returned SYNTH-B UID')
print('Three synthetic reproductions passed; no network or server writes.')
PY
```

Observed output, exit 0:

```text
JOB 1 reproduced: Result 7 recorded for pH on sample SYNTH-A.
JOB 2 reproduced: Label print request accepted for sample SYNTH-A.
JOB 3 reproduced: requested SYNTH-A; would submit returned SYNTH-B UID
Three synthetic reproductions passed; no network or server writes.
```

## Admin: three source-and-policy assertions

This verifies the actual access decision for the corresponding page URL and the presence of each unguarded form in source. It does not simulate browser rendering or invoke server actions.

```sh
node --import /private/tmp/actorlab-plan-r2-probes/node_modules/tsx/dist/loader.mjs --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import access from './lib/demo-access.ts';
const {evaluateDemoAccess} = access;
for (const [job, path, action] of [
  [4, 'app/admin/competencies/[id]/page.tsx', 'createReviewEvent'],
  [5, 'app/admin/documents/[id]/page.tsx', 'createDocumentVersion'],
  [6, 'app/admin/people/[id]/page.tsx', 'grantAuthorization'],
]) {
  const source = readFileSync(path, 'utf8');
  assert.ok(source.includes('<form action={' + action + '}'));
  assert.ok(!source.includes('adminMutationsEnabled'));
  const pathname = '/' + path.slice(4).replace('/page.tsx', '').replace('[id]', 'synthetic');
  const config = {pathname, authorization: 'Basic ' + btoa('fixture:fixture'), configuredUser: 'fixture', configuredPass: 'fixture'};
  assert.deepEqual(evaluateDemoAccess({...config, method: 'GET'}), {kind: 'allow'});
  assert.deepEqual(evaluateDemoAccess({...config, method: 'POST'}), {kind: 'read_only', status: 405});
  console.log('JOB ' + job + ' reproduced: ' + pathname + ' renders ' + action + ' form; authenticated POST is 405');
}
JS
```

Observed output, exit 0 (the word “renders” in this probe describes the unconditional source form, not a browser run):

```text
JOB 4 reproduced: /admin/competencies/synthetic renders createReviewEvent form; authenticated POST is 405
JOB 5 reproduced: /admin/documents/synthetic renders createDocumentVersion form; authenticated POST is 405
JOB 6 reproduced: /admin/people/synthetic renders grantAuthorization form; authenticated POST is 405
```

## Existing-test results

| Command selection | Tests | Passed | Failed | Exit |
| --- | ---: | ---: | ---: | ---: |
| Python unittest discovery `tests/voice`, `test_*selection.py` | 17 | 17 | 0 | 0 |
| Python unittest discovery `tests/voice`, `test_print_label_feedback.py` | 5 | 5 | 0 | 0 |
| Node: read-only person flow, person-detail server boundary, demo access | 13 | 13 | 0 | 0 |
| Direct Python result-target file (already included above) | 4 | 4 | 0 | 0 |
| Direct Python sample-lookup file (already included above) | 6 | 6 | 0 | 0 |

Baseline unique test total: 35. No tracked source or test modifications were made. The planner tests the evidence for work still needed; it does not report those defects repaired.
