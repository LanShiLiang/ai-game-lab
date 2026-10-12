import test from 'node:test';
import assert from 'node:assert/strict';
import { repositoryURL, submissionDraft, ideaIssueURL } from '../apps/web/src/submission.js';
const receiver = 'https://github.com/LanShiLiang/ai-game-lab';
const values = { name: '解谜 & 探险', repository: 'https://github.com/creator/puzzle.git', description: '探索迷宫，找到出口获胜。\n空格开始，方向键移动。', features: '会随光线改变的地图', requirements: '无需后端' };
test('submission opens the configured inbox with intact Chinese and multiline data', () => {
  const draft = submissionDraft(values, receiver), url = new URL(draft.url);
  assert.equal(url.origin + url.pathname, receiver + '/issues/new');
  assert.equal(url.searchParams.get('title'), '[游戏投稿] 解谜 & 探险');
  assert.ok(url.searchParams.get('body').includes(values.description));
  assert.ok(draft.body.includes('https://github.com/creator/puzzle'));
  for (const key of ['description', 'features', 'requirements']) assert.ok(url.searchParams.get('body').includes(values[key]), `${key} is preserved in the Issue`);
  assert.doesNotMatch(draft.body, /构建命令|构建方式|输出目录|部署版本|试玩地址/);
  assert.ok(!draft.body.includes('上传') && !draft.body.includes('附件'));
});
test('game submissions work with no optional feature description', () => {
  for (const features of ['', '   ', undefined]) {
    const draft = submissionDraft({ ...values, features }, receiver);
    assert.ok(draft.body.includes(values.description));
    assert.doesNotMatch(draft.body, /## 创意特色|undefined/);
  }
});
test('design ideas open the receiving Issue composer without a game repository', () => {
  const url = new URL(ideaIssueURL(receiver));
  assert.equal(url.origin + url.pathname, receiver + '/issues/new');
  assert.ok(url.searchParams.get('title').startsWith('[设计想法]'));
  assert.match(url.searchParams.get('body'), /没有游戏仓库也可以提交/);
  assert.match(url.searchParams.get('body'), /玩法与目标/);
  assert.doesNotMatch(url.searchParams.get('body'), /构建方式|输出目录|GitHub 链接/);
  assert.throws(() => ideaIssueURL('https://github.com.evil.test/a/b'));
});
test('submission rejects lookalike hosts and non-repository paths', () => {
  for (const url of ['javascript:alert(1)', 'https://github.com.evil.test/a/b', 'https://github.com/a/b/issues', 'https://github.com/a/..', 'https://user@github.com/a/b', 'https://github.com/a/b?x=1']) assert.throws(() => repositoryURL(url));
});
test('long drafts preserve full content for copying while limiting the GitHub URL', () => {
  const description = '收集光点解锁下一层迷宫。'.repeat(80);
  const draft = submissionDraft({ ...values, description }, receiver);
  assert.equal(draft.needsPaste, true); assert.ok(draft.url.length < 7500);
  assert.equal(new URL(draft.url).searchParams.has('body'), false);
  assert.ok(draft.body.includes(description));
});
