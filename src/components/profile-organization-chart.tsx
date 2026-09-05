import Image from "next/image";
import { organizationChart, organizationNodeForProfile, type OrganizationChartNode } from "@/lib/organization-chart-config";
import "./profile-organization-chart.css";

type ProfileOrganizationChartProps = { profileName?: string | null; isSelf?: boolean };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function OrganizationChartCard({ node, highlighted, isSelf }: { node: OrganizationChartNode; highlighted: boolean; isSelf: boolean }) {
  return (
    <article className={`organization-chart-card${highlighted ? " is-current" : ""}`} aria-label={`${node.displayName}, ${node.designation}${highlighted ? isSelf ? ", your position" : ", selected employee" : ""}`}>
      <div className="organization-chart-avatar" aria-hidden="true">
        {node.avatar ? <Image src={node.avatar} alt="" width={46} height={46} /> : <span>{initials(node.displayName)}</span>}
      </div>
      <div className="organization-chart-identity"><strong>{node.displayName}</strong><span>{node.designation}</span></div>
      {highlighted && isSelf && <span className="organization-chart-you">You</span>}
    </article>
  );
}

function OrganizationBranch({ node, highlightedKey, isSelf }: { node: OrganizationChartNode; highlightedKey?: string; isSelf: boolean }) {
  const children = organizationChart.filter((item) => item.parentKey === node.key);
  return (
    <li>
      <OrganizationChartCard node={node} highlighted={node.key === highlightedKey} isSelf={isSelf} />
      {children.length > 0 && <ul>{children.map((child) => <OrganizationBranch key={child.key} node={child} highlightedKey={highlightedKey} isSelf={isSelf} />)}</ul>}
    </li>
  );
}

export function ProfileOrganizationChart({ profileName, isSelf = false }: ProfileOrganizationChartProps) {
  const highlightedNode = organizationNodeForProfile(profileName);
  const roots = organizationChart.filter((node) => node.parentKey === null);
  return (
    <section className="organization-chart-section" aria-labelledby="organization-chart-title">
      <header><h2 id="organization-chart-title">{isSelf ? "Your Position in the Organization" : "Position in the Organization"}</h2><p>BSmile reporting structure</p></header>
      <div className="organization-chart-viewport">
        <ul className="organization-chart-tree" aria-label="BSmile organization hierarchy">
          {roots.map((root) => <OrganizationBranch key={root.key} node={root} highlightedKey={highlightedNode?.key} isSelf={isSelf} />)}
        </ul>
      </div>
    </section>
  );
}
