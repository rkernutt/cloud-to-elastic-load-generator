import { describe, it, expect } from "vitest";
import type { ServiceGroup } from "../data/serviceGroups";
import {
  inferDashboardServiceGroupLabel,
  inferMlJobServiceGroupLabel,
  groupMlJobRefsByServiceType,
  groupMlJobsByServiceType,
  sortDashboardServiceGroupLabels,
} from "./dashboardServiceGroup";

/** Two groups; longer id `apigateway` is listed first in walk order to mirror real catalogs. */
const minimalGroups: ServiceGroup[] = [
  {
    id: "net",
    label: "Networking",
    color: "#000",
    icon: "n",
    services: [
      { id: "apigateway", label: "API Gateway", icon: "", desc: "" },
      { id: "vpclattice", label: "VPC Lattice", icon: "", desc: "" },
    ],
  },
  {
    id: "comp",
    label: "Compute & Containers",
    color: "#000",
    icon: "c",
    services: [{ id: "lambda", label: "Lambda", icon: "", desc: "" }],
  },
];

describe("dashboardServiceGroup", () => {
  it("maps a Lambda dashboard to its service group label", () => {
    const d = { title: "AWS Lambda — Invocations & Performance" };
    expect(inferDashboardServiceGroupLabel(d, "aws", minimalGroups)).toBe("Compute & Containers");
  });

  it("returns Uncategorized when no service matches", () => {
    const d = { title: "Totally Unknown Dashboard" };
    expect(inferDashboardServiceGroupLabel(d, "aws", minimalGroups)).toBe("Uncategorized");
  });

  it("sorts labels like the Services page with Uncategorized last", () => {
    expect(
      sortDashboardServiceGroupLabels(
        ["Uncategorized", "Networking", "Compute & Containers"],
        minimalGroups
      )
    ).toEqual(["Networking", "Compute & Containers", "Uncategorized"]);
  });

  it("sorts alphabetically with Other last when serviceGroups is empty", () => {
    expect(sortDashboardServiceGroupLabels(["Z", "Other", "A"], [])).toEqual(["A", "Z", "Other"]);
  });

  it("maps an AWS new-services ML job to its wizard group via dataset slug", () => {
    const j = {
      id: "aws-vpclattice-5xx-spike",
      description: "VPC Lattice 5xx",
      job: {},
      datafeed: {
        query: {
          bool: {
            filter: [{ term: { "event.dataset": "aws.vpclattice" } }],
          },
        },
      },
    };
    expect(inferMlJobServiceGroupLabel(j, "aws", minimalGroups)).toBe("Networking");
  });

  it("groupMlJobRefsByServiceType preserves file reference per job", () => {
    const fileA = { group: "new-services", description: "", jobs: [] as never[] };
    const lattice = {
      id: "aws-vpclattice-x",
      description: "",
      job: {},
      datafeed: {
        query: { bool: { filter: [{ term: { "event.dataset": "aws.vpclattice" } }] } },
      },
    };
    const groups = groupMlJobRefsByServiceType(
      [{ file: fileA, job: lattice }],
      "aws",
      minimalGroups
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Networking");
    expect(groups[0].refs[0].file.group).toBe("new-services");
  });

  it("groupMlJobsByServiceType orders subgroups like the Services page", () => {
    const lattice = {
      id: "aws-vpclattice-x",
      description: "",
      job: {},
      datafeed: {
        query: { bool: { filter: [{ term: { "event.dataset": "aws.vpclattice" } }] } },
      },
    };
    const lambda = {
      id: "aws-lambda-x",
      description: "",
      job: {},
      datafeed: {
        query: { bool: { filter: [{ term: { "event.dataset": "aws.lambda" } }] } },
      },
    };
    const groups = groupMlJobsByServiceType([lambda, lattice], "aws", minimalGroups);
    expect(groups.map((g) => g.label)).toEqual(["Networking", "Compute & Containers"]);
    expect(groups[0].jobs.map((x) => x.id)).toEqual(["aws-vpclattice-x"]);
    expect(groups[1].jobs.map((x) => x.id)).toEqual(["aws-lambda-x"]);
  });
});
