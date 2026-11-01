#!/usr/bin/env python3
"""Best-effort public hosted-metadata archival; secrets are never queried or written."""
from __future__ import annotations
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from hashlib import sha256
from datetime import datetime, timezone
import json, os, re, time

BASE="https://api.github.com"
TOKEN=os.environ.get("GH_TOKEN","")
OUT=Path(os.environ.get("METADATA_OUTPUT","/tmp/dfweb-hosted"))
OUT.mkdir(parents=True,exist_ok=True)
sources=("marius-patrik/GHCode","marius-patrik/DarkFactory-template")
report={"createdUtc":datetime.now(timezone.utc).isoformat(),"sourceRepos":{},"limitations":[
  "Public GitHub-hosted metadata is distinct from original Git commit ancestry.",
  "Secrets, private browser user state, and GitHub secret values are never read.",
  "Historical Actions artifacts and GitHub settings may be inaccessible or expired.",
  "The resulting 90-day Actions artifact is not an independent off-GitHub backup."]}

def download(url,accept="application/vnd.github+json"):
    headers={"User-Agent":"DarkFactory-web-source-preservation","Accept":accept,
             "X-GitHub-Api-Version":"2022-11-28"}
    if TOKEN and url.startswith(BASE+"/"):
        headers["Authorization"]="Bearer "+TOKEN
    last=None
    for i in range(3):
        try:
            with urlopen(Request(url,headers=headers),timeout=35) as stream:
                return stream.read()
        except (HTTPError,URLError,TimeoutError) as err:
            last=err
            if isinstance(err,HTTPError) and err.code not in (403,429,500,502,503,504):
                break
            time.sleep(i+1)
    raise RuntimeError(f"{url}: {type(last).__name__} HTTP {getattr(last,'code','unknown')}")

def api(endpoint):
    return json.loads(download(BASE+endpoint))

def pages(endpoint,maxpages=30):
    records=[]
    for page in range(1,maxpages+1):
        sep="&" if "?" in endpoint else "?"
        items=api(f"{endpoint}{sep}per_page=100&page={page}")
        if not isinstance(items,list): raise ValueError("Non-list API response")
        records.extend(items)
        if len(items)<100:return records
    raise ValueError("Exceeded archival pagination limit for "+endpoint)

def save(path,object):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(object,indent=2,ensure_ascii=False)+"\n",encoding="utf8")

for name in sources:
    root=OUT/name.split("/")[1]
    root.mkdir(exist_ok=True)
    status={"counts":{},"errors":[],"assets":[]}
    report["sourceRepos"][name]=status
    data={}
    for kind,route in {
       "repository":"/repos/"+name,
       "issues":"/repos/"+name+"/issues?state=all",
       "pulls":"/repos/"+name+"/pulls?state=all",
       "releases":"/repos/"+name+"/releases",
       "branches":"/repos/"+name+"/branches",
       "tags":"/repos/"+name+"/tags",
       "actions-runs-sample":"/repos/"+name+"/actions/runs?per_page=100",
    }.items():
        try:
            response=api(route) if kind in ("repository","actions-runs-sample") else pages(route)
            data[kind]=response
            save(root/(kind+".json"),response)
            status["counts"][kind]=len(response) if isinstance(response,list) else 1
        except Exception as exc:
            status["errors"].append({"route":route,"error":str(exc)})
    for pr in data.get("pulls",[]):
        number=pr["number"]
        for kind,route in {
          "reviews":f"/repos/{name}/pulls/{number}/reviews",
          "review-comments":f"/repos/{name}/pulls/{number}/comments",
          "conversation":f"/repos/{name}/issues/{number}/comments",
        }.items():
            try:
                items=pages(route)
                save(root/"pull-details"/f"{number}-{kind}.json",items)
                status["counts"][f"pr{number}-{kind}"]=len(items)
            except Exception as exc:
                status["errors"].append({"route":route,"error":str(exc)})
    for issue in data.get("issues",[]):
        if "pull_request" in issue:continue
        number=issue["number"]
        route=f"/repos/{name}/issues/{number}/comments"
        try:
            items=pages(route)
            save(root/"issue-comments"/f"{number}.json",items)
            status["counts"][f"issue{number}-comments"]=len(items)
        except Exception as exc:
            status["errors"].append({"route":route,"error":str(exc)})
    for release in data.get("releases",[]):
        for asset in release.get("assets",[]):
            filename=re.sub(r"[^A-Za-z0-9._-]","_",asset["name"])
            meta={"id":asset["id"],"name":asset["name"],"tag":release["tag_name"]}
            try:
                binary=download(asset["browser_download_url"],"application/octet-stream")
                target=root/"release-assets"/f'{asset["id"]}-{filename}'
                target.parent.mkdir(exist_ok=True)
                target.write_bytes(binary)
                meta.update(status="saved",size=len(binary),sha256=sha256(binary).hexdigest())
            except Exception as exc:
                meta.update(status="blocked",error=str(exc))
            status["assets"].append(meta)
    print(name,"records",len(status["counts"]),"errors",len(status["errors"]),"assets",len(status["assets"]))
save(OUT/"EXPORT_REPORT.json",report)
print("Export status:",OUT/"EXPORT_REPORT.json")
