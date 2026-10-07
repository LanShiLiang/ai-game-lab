export function repositoryURL(value) {
  if (!/^https:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/.test(value) || /\/(?:\.|\.\.)\/?$/.test(value)) throw new Error('请填写 https://github.com/作者/仓库 格式的公开仓库地址。');
  return value.replace(/\/$/, '').replace(/\.git$/, '');
}

function issueDraft(title, body, receiver) {
  const url = new URL(`${repositoryURL(receiver)}/issues/new`);
  url.searchParams.set('title', title); url.searchParams.set('body', body);
  const needsPaste = url.href.length > 7500;
  if (needsPaste) url.searchParams.delete('body');
  return { title, body, url: url.href, needsPaste };
}

export function submissionDraft(values, receiver) {
  const repository = repositoryURL(values.repository.trim());
  const features = values.features?.trim();
  const body = [
    '## 游戏名称', values.name.trim(), '', '## GitHub 链接', repository,
    '', '## 游戏介绍', values.description.trim(),
    '', '## 后端与部署需求', values.requirements.trim(),
    ...(features ? ['', '## 创意特色', features] : [])
  ].join('\n');
  return issueDraft(`[游戏投稿] ${values.name.trim()}`, body, receiver);
}

export function ideaIssueURL(receiver) {
  const body = [
    '请把下面的提示替换为你的描述，没有游戏仓库也可以提交。',
    '', '## 一句话介绍', '我想做一个怎样的游戏？',
    '', '## 玩法与目标', '玩家要做什么？怎样获胜或失败？',
    '', '## 创意与灵感（选填）', '有什么特别的机制、故事或参考？'
  ].join('\n');
  return issueDraft('[设计想法] 请填写想法名称', body, receiver).url;
}

export async function initializeSubmission() {
  const form = document.querySelector('#submission-form'), status = document.querySelector('#submission-status');
  const button = document.querySelector('#prepare-submission'); let receiver;
  try {
    const response = await fetch('./src/community.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('收件配置读取失败');
    receiver = repositoryURL((await response.json()).submissionRepository);
    const receivingRepo = document.querySelector('#submission-receiver');
    receivingRepo.href = `${receiver}/issues/new`; receivingRepo.textContent = receiver.replace('https://github.com/', ''); receivingRepo.hidden = false;
    const inbox = document.querySelector('#submission-inbox'); inbox.href = `${receiver}/issues`; inbox.hidden = false;
    const idea = document.querySelector('#submit-idea'); idea.href = ideaIssueURL(receiver); idea.hidden = false;
    button.disabled = false; status.textContent = '填写后直接前往收件仓库的新建 Issue 页面。登录 GitHub 后检查正文并提交。';
  } catch {
    status.textContent = '收件仓库尚未配置。可先填写资料，配置后即可生成投稿草稿。';
    button.disabled = true;
  }
  form.addEventListener('input', event => {
    event.target.setCustomValidity?.('');
    document.querySelector('#submission-preview').hidden = true;
  });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!receiver) return;
    for (const field of form.querySelectorAll('input[required]:not([type="checkbox"]), textarea[required]')) {
      field.setCustomValidity(field.value.trim() ? '' : '请填写内容，不能只输入空格。');
    }
    try { repositoryURL(form.elements.repository.value.trim()); form.elements.repository.setCustomValidity(''); }
    catch (error) { form.elements.repository.setCustomValidity(error.message); }
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(['name', 'repository', 'description', 'requirements', 'features'].map(key => [key, form.elements[key].value]));
    const draft = submissionDraft(values, receiver);
    document.querySelector('#submission-draft').value = `${draft.title}\n\n${draft.body}`;
    document.querySelector('#open-submission').href = draft.url;
    document.querySelector('#open-submission').textContent = draft.needsPaste ? '打开 ai-game-lab 粘贴草稿 ↗' : '打开 ai-game-lab Issue 页面 ↗';
    document.querySelector('#submission-paste-hint').hidden = !draft.needsPaste;
    document.querySelector('#submission-preview').hidden = false;
    status.textContent = draft.needsPaste ? '草稿已生成，尚未提交。内容较长，请先复制草稿，再到收件仓库粘贴正文并确认提交。' : '投稿内容已准备，尚未提交。请在 GitHub 页面检查并提交；若页面未打开，请点击下方的 Issue 链接。';
    if (draft.needsPaste) document.querySelector('#copy-submission').focus({ preventScroll: true });
    else window.open(draft.url, '_blank', 'noopener,noreferrer');
  });
  document.querySelector('#copy-submission').onclick = async () => {
    const draft = document.querySelector('#submission-draft');
    try { await navigator.clipboard.writeText(draft.value); status.textContent = '投稿草稿已复制。可粘贴到 GitHub Issue 正文，检查后确认提交。'; }
    catch { draft.focus(); draft.select(); status.textContent = '请复制已选中的草稿，再粘贴到 GitHub Issue。'; }
  };
}
