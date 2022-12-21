// ==UserScript==
// @name         GitLab Terraform Plan Summarizer
// @namespace    https://github.com/spacebarley/GitLab-Terraform-Plan-Summarizer
// @version      0.1
// @description  Summarize Terraform plan's effect! Add additional logs in Terraform Plan Job page. If you host your own GitLab, change the @match to your GitLab's URL. (e.g. https://gitlab.yourdomain.com/**/jobs/*)
// @author       spacebarley
// @match        https://gitlab.com/**/jobs/*
// @icon         https://gitlab.com/assets/favicon-72a2cad5025aa931d6ea56c3201d1f18e68a8cd39788c7c80d5b2b82aa5143ef.png
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const Operation = {
    CREATE: 'Create',
    REPLACE: 'Replace',
    UPDATE: 'In-place Update',
    DESTROY: 'Destroy',
  };

  function findLines() {
    const lines = document.getElementsByClassName('js-line', 'log-line');
    if (lines.length === 0) {
      return;
    }
    const resourceLogs = {};
    const attributeCreate = `<span class="gl-white-space-pre-wrap"> will be cre\
ated</span>`;
    const attributeReplace = `<span class="gl-white-space-pre-wrap"> must be </\
span><span class="gl-white-space-pre-wrap term-fg-l-red term-bold">replaced</sp\
an>`;
    const attributeUpdate = `<span class="gl-white-space-pre-wrap"> will be upd\
ated in-place</span>`;
    const attributeDestroy = `<span class="gl-white-space-pre-wrap"> will be </\
span><span class="gl-white-space-pre-wrap term-fg-l-red term-bold">destroyed</s\
pan>`;

    const planSummary = /(?<add>[0-9]+) to add, (?<change>[0-9]+) to change, (?<destroy>[0-9]+) to destroy./;

    const test = {
      [Operation.DESTROY]: attributeDestroy,
      [Operation.REPLACE]: attributeReplace,
      [Operation.CREATE]: attributeCreate,
      [Operation.UPDATE]: attributeUpdate,
    };

    for (const k of Object.keys(test)) {
      resourceLogs[k] = [];
    }

    let planResultLog;
    for (const line of lines) {
      if (planSummary.test(line.innerHTML)) {
        planResultLog = line.innerHTML.match(planSummary).groups;
        continue;
      }
      for (const [k, v] of Object.entries(test)) {
        if (line.innerHTML.indexOf(v) > -1) {
          resourceLogs[k].push(line);
        }
      }
    }
    const logCount = Number(lines[lines.length - 1].children[0].innerHTML);
    // If there is no plan result, do nothing.
    if (planResultLog) {
      addSummaryLogs(resourceLogs, planResultLog, logCount);
    }
  }

  function createLog(lineNumber, color, text) {
    const fragment = document.createDocumentFragment();
    const div = document.createElement('div');
    div.insertAdjacentHTML('afterbegin', `<div class="js-line log-line"><a id=\
L${lineNumber} href=#L${lineNumber} class="gl-link d-inline-block text-right li\
ne-number flex-shrink-0">${lineNumber}</a><span class="gl-white-space-pre-wrap \
term-fg-l-${color} term-bold">${text}</span></div>`);
    fragment.appendChild(div);
    return fragment.firstElementChild.firstElementChild;
  }

  function addSummaryLogs(result, planResultLog, lineCount) {
    const logContainer = document.
        getElementsByClassName('job-log', 'd-block')[0];

    const summary = document.createElement('div');

    summary.appendChild(createLog(++lineCount, 'green', ''));
    summary.appendChild(createLog(++lineCount, 'cyan', `Summarize Terraform Pla\
n Result. Click the line number and move to the affected resource line.`));

    // Validate the affected resources' count expectation and plan log's result are the same.
    const operationType = {
      add: [Operation.CREATE, Operation.REPLACE],
      change: [Operation.UPDATE],
      destroy: [Operation.REPLACE, Operation.DESTROY],
    };
    const resultCount = {add: 0, change: 0, destroy: 0};
    Object.entries(result).map(([k, v]) => {
      for (const [opName, opVal] of Object.entries(operationType)) {
        if (opVal.includes(k)) {
          resultCount[opName] += v.length;
        }
      }
    });
    for (const [k, v] of Object.entries(resultCount)) {
      if (v !== Number(planResultLog[k])) {
        summary.appendChild(createLog(++lineCount, 'red', `Mismatch on plan res\
ult and script's expectation. There's a problem in the summarize script!!!`));
        logContainer.insertBefore(
            summary,
            logContainer.children[logContainer.children.length - 1].nextSibling,
        );
        return;
      }
    }

    // Create Log HTML DOM element
    summary.appendChild(createLog(++lineCount, 'green', '* Plan Result: ' +
    Object.entries(result).
        map(([k, v]) => `${k} Count: ${v.length}`).join(`, `)));
    for (const r of Object.keys(result)) {
      if (operationType.destroy.includes(r) && result[r].length > 0) {
        summary.appendChild(
            createLog(++lineCount, 'red', `* ${r} Count: ${result[r].length}`),
        );
      } else {
        summary.appendChild(
            createLog(
                ++lineCount,
                'green',
                `* ${r} Count: ${result[r].length}`,
            ),
        );
      }
      let indentColor;
      switch (r) {
        case Operation.CREATE:
          indentColor = 'green';
          break;
        case Operation.UPDATE:
          indentColor = 'yellow';
          break;
        case Operation.REPLACE:
          indentColor = 'red';
          break;
        case Operation.DESTROY:
          indentColor = 'red';
          break;
      }
      const indent = `<span class="gl-white-space-pre-wrap term-fg-\
${indentColor}">│</span>`;

      for (const data of result[r]) {
        const newLine = data.cloneNode(true);
        newLine.children[0].id = 'L' + ++lineCount;
        newLine.children[0].innerHTML = lineCount;
        // Delete redundant lines but the resource name
        while (newLine.children[1] && newLine.children[1].nextSibling) {
          newLine.children[1].nextSibling.remove();
        }
        // Decorate log
        newLine.children[1].classList.remove('term-bold');
        newLine.children[1].textContent = newLine.children[1].textContent.
            split('# ')?.[1] ?? newLine.children[1].textContent;
        newLine.children[1].insertAdjacentHTML('beforebegin', indent);
        newLine.children[1].insertAdjacentHTML('afterend', `<span class="gl-whi\
te-space-pre-wrap"> </span>`);
        summary.appendChild(newLine);
      }
    }
    // Add Log elements to log container
    logContainer.insertBefore(
        summary,
        logContainer.children[logContainer.children.length - 1].nextSibling,
    );
  }

  function waitUntilInitialized(option, initializer, callback) {
    let {interval, maxRetry} = option;
    if (maxRetry === 0) {
      console.log('Failed to load script in ' + maxRetry * interval + 'ms');
      return null;
    }
    if (initializer()) {
      return callback();
    } else {
      setTimeout(() => {
        waitUntilInitialized(
            {interval, maxRetry: --maxRetry},
            initializer,
            callback,
        );
      }, interval);
    }
  }

  const initializer = function() {
    return document.querySelector('.page-initialised') !== null;
  };

  waitUntilInitialized({interval: 500, maxRetry: 30}, initializer, findLines);
})();
