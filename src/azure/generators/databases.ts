import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  azureCloud,
  makeAzureSetup,
} from "./helpers.js";

export function generateSqlDatabaseLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const server = `sql-${randId(6).toLowerCase()}`;
  const db = rand(["app", "reporting", "auth"]);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Sql/servers"),
    azure: {
      sql_database: {
        server,
        database: db,
        resource_group: resourceGroup,
        dtu_percent: isErr ? randFloat(95, 100) : randFloat(10, 75),
        deadlocks: isErr ? randInt(1, 20) : 0,
        failed_connections: isErr ? randInt(5, 200) : randInt(0, 3),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, isErr ? 9e9 : 8e8) },
    message: isErr
      ? `SQL ${server}/${db}: throttling / deadlock`
      : `SQL ${server}/${db}: workload stable`,
  };
}

export function generateCosmosDbLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `cosmos-${randId(6).toLowerCase()}`;
  const pk = `/partition${randInt(0, 31)}`;
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
    azure: {
      cosmos_db: {
        account,
        resource_group: resourceGroup,
        database: rand(["main", "events", "catalog"]),
        container: rand(["items", "orders", "profiles"]),
        partition_key: pk,
        ru_consumed: isErr ? randInt(8000, 20_000) : randInt(50, 4000),
        status_code: isErr ? 429 : 200,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, isErr ? 5e9 : 2e8) },
    message: isErr ? `Cosmos ${account}: throttled (429)` : `Cosmos ${account}: request OK`,
  };
}
