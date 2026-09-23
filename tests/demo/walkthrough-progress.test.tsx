import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import DemoPage from '../../app/demo/page';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function text(node: React.ReactNode): string {
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return text(node.props.children);
  if (Array.isArray(node)) return node.map(text).join('');
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

function mount(t: TestContext) {
  const parentState: unknown[] = [];
  let childState: unknown[] = [];
  let activeState = parentState;
  let index = 0;
  let childType: unknown;

  const stateHook = t.mock.method(React, 'useState', (initial: unknown) => {
    const state = activeState;
    const slot = index++;
    if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
    return [state[slot], (next: unknown) => {
      state[slot] = typeof next === 'function' ? next(state[slot]) : next;
    }];
  });

  function render() {
    activeState = parentState;
    index = 0;
    const page = DemoPage();
    const steps = elements(page).filter(element =>
      typeof element.type === 'function' && /^(SampleEntryStep|COCStep|ReportStep)$/.test(element.type.name));
    assert.equal(steps.length, 1, 'only the active step is mounted');
    const step = steps[0];
    // Separate hook slots by component, discarding child state on conditional unmount.
    if (childType !== step.type) {
      childState = [];
      childType = step.type;
    }
    activeState = childState;
    index = 0;
    const content = (step.type as React.FunctionComponent<any>)(step.props);
    // Inspect only local elements; never mount the external scheduling widget.
    return { page, content };
  }

  return {
    render,
    unmount: () => stateHook.mock.restore(),
    click(label: string) {
      const { page, content } = render();
      const button = [...elements(page), ...elements(content)].find(element =>
        element.type === 'button' &&
        (element.props['aria-label'] ?? text(element)).trim() === label);
      assert.ok(button, `button ${label} must exist`);
      assert.ok(!button.props.disabled, `${label} must be enabled`);
      button.props.onClick();
      return render();
    },
  };
}

for (const navigation of ['buttons', 'tabs'] as const) {
  test(`walkthrough retains completion across ${navigation} and resets on a fresh mount`, t => {
    const visit = mount(t);
    const entry = navigation === 'buttons' ? 'Previous' : 'Step 1 of 3: Sample Entry';
    const custody = navigation === 'buttons' ? 'Next Step' : 'Step 2 of 3: Chain of Custody';
    const report = navigation === 'buttons' ? 'Next Step' : 'Step 3 of 3: Demo Report';

    assert.match(text(visit.render().content), /Log Sample/);
    assert.match(text(visit.click('Log Sample').content), /Sample Logged/);
    assert.match(text(visit.click(custody).content), /Click to Sign/);
    assert.match(text(visit.click(entry).content), /Sample Logged/);
    visit.click(custody);
    assert.match(text(visit.click('Click to Sign').content), /COC complete\./);
    assert.match(text(visit.click(report).content), /Generate Report/);
    assert.match(text(visit.click('Generate Report').content), /Synthetic Analytical Report/);
    const returned = visit.click(navigation === 'buttons' ? 'Previous' : 'Step 2 of 3: Chain of Custody');
    assert.match(text(returned.content), /COC complete\./);
    assert.doesNotMatch(text(returned.content), /Click to Sign/);
    assert.match(text(visit.click(entry).content), /Sample Logged/);
    visit.unmount();

    const freshVisit = mount(t);
    const freshEntry = text(freshVisit.render().content);
    assert.match(freshEntry, /Log Sample/);
    assert.doesNotMatch(freshEntry, /Sample Logged/);
    const freshCustody = text(freshVisit.click(custody).content);
    assert.match(freshCustody, /Click to Sign/);
    assert.doesNotMatch(freshCustody, /COC complete\./);
    freshVisit.unmount();
  });
}
