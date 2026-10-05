// Temporary isolated PostgreSQL with synthetic fixtures only. Never reads
// application credentials, Supabase connection settings, or production data.
import {spawnSync} from "node:child_process";
import {readFileSync,readdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {assertScheduleConcurrency} from "./social_x_schedule_concurrency.mjs";

const name=`codex-social-x-schedule-${randomUUID().slice(0,8)}`;
function docker(args,options={}) {
  const result=spawnSync("docker",args,{encoding:"utf8",...options});
  if(result.status!==0) throw new Error(result.stderr||result.stdout||"Docker unavailable");
  return result.stdout;
}
try {
  docker(["run","--detach","--rm","--name",name,"--env","POSTGRES_HOST_AUTH_METHOD=trust","postgres:17-alpine"]);
  let ready=false;
  for(let attempt=0;attempt<60;attempt++) {
    if(spawnSync("docker",["exec",name,"pg_isready","-h","127.0.0.1","-U","postgres"]).status===0) {
      ready=true;
      break;
    }
    await new Promise((resolve)=>setTimeout(resolve,500));
  }
  if(!ready) throw new Error("Temporary Postgres not ready");
  const files=[
    "tests/shared-db-fixture.sql",
    ...readdirSync("supabase/migrations").filter((file)=>file.endsWith(".sql")).sort()
      .map((file)=>`supabase/migrations/${file}`),
    "tests/x-publish-assertions.sql",
    "tests/x-schedule-assertions.sql",
  ];
  console.log(docker([
    "exec","-i",name,"psql","-h","127.0.0.1","-U","postgres","-X","-q",
    "--single-transaction","-v","ON_ERROR_STOP=1","-f","-",
  ],{input:files.map((file)=>readFileSync(file,"utf8")).join("\n")}));
  await assertScheduleConcurrency(name);
} finally {
  spawnSync("docker",["stop",name],{encoding:"utf8"});
}
