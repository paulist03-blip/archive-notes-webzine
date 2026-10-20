async page => {
  // Test-only store replacement: no sample content is deployed or persisted.
  await page.route('**/assets/forum-config.js', route => route.fulfill({ contentType:'application/javascript', body:'window.PAN_FORUM_CONFIG={firebase:{apiKey:"test",authDomain:"test",projectId:"test",appId:"test"}};' }));
  const mock = `export async function createForumStore(){
    let posts=[], replies=[], reports=[], failed=false;
    return {
      listPosts:async()=>({items:[...posts],more:false}), listReplies:async()=>({items:[...replies],more:false}), owns:async()=>true,
      publish:async value=>{if(value.title==='실패 검증')throw new Error('검증용 연결 실패');const id='test-one';posts.unshift({...value,id,createdAt:Date.now(),status:'published'});return id;},
      reply:async(id,body)=>{replies.push({id:'test-reply',body,createdAt:Date.now(),status:'published'});},
      report:async()=>{reports.push(true);},
      remove:async(id,replyId)=>{if(replyId)replies=replies.map(r=>({...r,status:'deleted',body:''}));else posts=posts.map(p=>({...p,status:'deleted',title:'삭제된 감상',work:'',body:''}));}
    };
  }`;
  await page.route('**/assets/forum-store.js', route=>route.fulfill({contentType:'application/javascript',body:mock}));
  await page.reload();
  await page.getByText('익명 글쓰기',{exact:true}).waitFor();
  const title=page.getByRole('textbox',{name:'제목',exact:true}), work=page.getByRole('textbox',{name:'작품 이름',exact:true}), body=page.getByRole('textbox',{name:'내용',exact:true});
  await title.fill('실패 검증'); await work.fill('검증용 작품'); await body.fill('보존되어야 하는 입력');
  await page.locator('[name=consent]').check(); await page.getByRole('button',{name:'익명으로 게시',exact:true}).click();
  await page.getByText('검증용 연결 실패',{exact:true}).waitFor();
  if (await body.inputValue()!=='보존되어야 하는 입력') throw Error('Failed write lost draft');
  await title.fill('검증용 감상'); await body.fill('<script>alert(1)</script>\n\n'+'작품을 읽은 기록. '.repeat(1500));
  await page.getByRole('button',{name:'익명으로 게시',exact:true}).click();
  await page.getByRole('heading',{name:'검증용 감상',exact:true}).waitFor();
  if(await page.locator('.forum-prose script').count()) throw Error('Stored XSS');
  await page.getByRole('textbox',{name:'답글 내용',exact:true}).fill('실제 접수가 아닌 테스트 답글');
  await page.getByRole('checkbox',{name:'이 답글을 공개합니다.',exact:true}).check();
  await page.getByRole('button',{name:'익명으로 답글 남기기',exact:true}).click();
  await page.locator('.forum-reply .forum-prose').getByText('실제 접수가 아닌 테스트 답글',{exact:true}).waitFor();
  await page.locator('.forum-post-reading > .forum-post-actions').getByRole('button',{name:'신고',exact:true}).click();
  await page.getByRole('button',{name:'신고 접수',exact:true}).click();
  await page.getByText('신고를 관리자에게 전달했습니다.',{exact:true}).waitFor();
  page.once('dialog', dialog=>dialog.accept());
  await page.locator('.forum-reply').getByRole('button',{name:'내 글 삭제',exact:true}).click();
  await page.getByText('삭제된 답글입니다.',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Mobile overflow');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.forum-post-reading > .forum-post-actions').getByRole('button',{name:'내 글 삭제',exact:true}).click();
  await page.getByRole('heading',{name:'삭제된 감상',exact:true}).waitFor();
  await page.unrouteAll(); await page.reload();
  console.log('PASS: mocked write failure retention, long post, XSS, reply, private report workflow, own deletion, mobile');
}
