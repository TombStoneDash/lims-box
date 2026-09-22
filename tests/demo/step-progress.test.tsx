import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DemoPage from '../../app/demo/page';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function harness(t: TestContext) {
  // tsx uses classic JSX for this repository's jsx: preserve setting.
  const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
  t.after(() => {
    if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  let activeStates: unknown[];
  let stateIndex = 0;
  t.mock.method(React, 'useState', (initial: unknown) => {
    const states = activeStates;
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], (next: unknown) => {
      states[index] = typeof next === 'function' ? next(states[index]) : next;
    }];
  });

  return function mount() {
    const componentStates = new Map<Function, unknown[]>();
    let tree: React.ReactNode;

    function render() {
      const mounted = new Set<Function>();
      function invoke(component: Function, props = {}) {
        mounted.add(component);
        if (!componentStates.has(component)) componentStates.set(component, []);
        activeStates = componentStates.get(component)!;
        stateIndex = 0;
        return component(props);
      }
      function resolve(node: React.ReactNode): React.ReactNode {
        if (Array.isArray(node)) return node.map(resolve);
        if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return node;
        // Expand the actual local steps so their completion buttons are clickable.
        // Leave external components and the unrelated calendar to the server renderer.
        if (typeof node.type === 'function' && /^(SampleEntryStep|COCStep|ReportStep)$/.test(node.type.name)) {
          return resolve(invoke(node.type, node.props));
        }
        if (node.props.children === undefined) return node;
        return React.cloneElement(node, {}, ...React.Children.toArray(node.props.children).map(resolve));
      }
      tree = resolve(invoke(DemoPage));
      // Model conditional unmounts: step-local hooks must not survive navigation.
      for (const component of componentStates.keys()) {
        if (!mounted.has(component)) componentStates.delete(component);
      }
    }
    render();
    return {
      markup: () => renderToStaticMarkup(tree),
      click(label: string) {
        const buttons = elements(tree).filter(element => element.type === 'button');
        const button = buttons.find(element => {
          const name = element.props['aria-label'] ?? renderToStaticMarkup(element).replace(/<[^>]*>/g, '').trim();
          return name === label || name === `${label} (current)`;
        });
        assert.ok(button, `Expected button: ${label}`);
        assert.ok(!button.props.disabled, `${label} must be enabled`);
        button.props.onClick();
        render();
      },
      unmount() { componentStates.clear(); tree = null; },
    };
  };
}

const tabs = ['Step 1 of 3: Sample Entry', 'Step 2 of 3: Chain of Custody', 'Step 3 of 3: Demo Report'];
const actions = ['Log Sample', 'Click to Sign', 'Generate Report'];
const completed = [/Sample Logged/, /COC complete\./, /Synthetic Analytical Report/];

for (const navigation of ['tabs', 'Previous/Next']) {
  test(`completion survives ${navigation} navigation for all steps and resets on a fresh mount`, t => {
    const mount = harness(t);
    const page = mount();

    for (let step = 0; step < 3; step++) {
      if (step > 0) page.click(navigation === 'tabs' ? tabs[step] : 'Next Step');
      assert.doesNotMatch(page.markup(), completed[step]);
      page.click(actions[step]);
      assert.match(page.markup(), completed[step]);
      assert.doesNotMatch(page.markup(), new RegExp(`>${actions[step]}(?: |<)`));

      if (navigation === 'tabs') {
        page.click(tabs[(step + 1) % 3]);
        assert.doesNotMatch(page.markup(), completed[step]);
        page.click(tabs[step]);
      } else if (step < 2) {
        page.click('Next Step');
        assert.doesNotMatch(page.markup(), completed[step]);
        page.click('Previous');
      } else {
        page.click('Previous');
        assert.doesNotMatch(page.markup(), completed[step]);
        page.click('Next Step');
      }
      assert.match(page.markup(), completed[step]);
    }

    // All three completions remain after the entire walkthrough.
    page.click(navigation === 'tabs' ? tabs[1] : 'Previous');
    assert.match(page.markup(), completed[1]);
    page.click(navigation === 'tabs' ? tabs[0] : 'Previous');
    assert.match(page.markup(), completed[0]);
    page.click(navigation === 'tabs' ? tabs[1] : 'Next Step');
    page.click(navigation === 'tabs' ? tabs[2] : 'Next Step');
    assert.match(page.markup(), completed[2]);
    assert.match(page.markup(), /No customer, patient, or production records are used on this page/);

    page.unmount();
    const fresh = mount();
    for (let step = 0; step < 3; step++) {
      if (step > 0) fresh.click('Next Step');
      assert.match(fresh.markup(), new RegExp(actions[step]));
      assert.doesNotMatch(fresh.markup(), completed[step]);
      assert.match(fresh.markup(), /This page is a synthetic demonstration/);
    }
  });
}
