"use client";

import Image from "next/image";
import { organizationChart, organizationNodeForProfile, type OrganizationChartNode } from "@/lib/organization-chart-config";
import "./profile-organization-chart.css";

type ProfileOrganizationChartProps = { profileName?: string | null; profilePhoto?: string | null; isSelf?: boolean };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function OrganizationChartCard({ node, highlighted, profilePhoto, isSelf }: { node: OrganizationChartNode; highlighted: boolean; profilePhoto?: string | null; isSelf: boolean }) {
  const avatar = highlighted && profilePhoto ? profilePhoto : node.avatar;
  return (
    <article className={`organization-chart-card${highlighted ? " is-current" : ""}`} aria-label={`${node.displayName}, ${node.designation}${highlighted ? isSelf ? ", your position" : ", selected employee" : ""}`}>
      <div className="organization-chart-avatar" aria-hidden="true">
        {avatar ? <Image src={avatar} alt="" width={50} height={50} unoptimized={avatar.startsWith("blob:") || avatar.includes("token=")} /> : <span>{initials(node.displayName)}</span>}
      </div>
      <div className="organization-chart-identity"><strong>{node.displayName}</strong><span>{node.designation}</span></div>
      {highlighted && isSelf && <span className="organization-chart-you">You</span>}
    </article>
  );
}

function OrganizationBranch({ node, highlightedKey, profilePhoto, isSelf }: { node: OrganizationChartNode; highlightedKey?: string; profilePhoto?: string | null; isSelf: boolean }) {
  const children = organizationChart.filter((item) => item.parentKey === node.key);
  return (
    <li className={`organization-chart-node organization-chart-node-${node.key}`}>
      <OrganizationChartCard node={node} highlighted={node.key === highlightedKey} profilePhoto={profilePhoto} isSelf={isSelf} />
      {children.length > 0 && <ul data-parent={node.key}>{children.map((child) => <OrganizationBranch key={child.key} node={child} highlightedKey={highlightedKey} profilePhoto={profilePhoto} isSelf={isSelf} />)}</ul>}
    </li>
  );
}

export function ProfileOrganizationChart({ profileName, profilePhoto, isSelf = false }: ProfileOrganizationChartProps) {
  const highlightedNode = organizationNodeForProfile(profileName);
  const roots = organizationChart.filter((node) => node.parentKey === null);

  return (
    <section className="organization-chart-section" aria-labelledby="organization-chart-title">
      <header><h2 id="organization-chart-title">Organization chart</h2><p>Reporting structure at BSmile.</p></header>
      <div className="organization-chart-viewport">
        <ul className="organization-chart-tree" aria-label="BSmile organization hierarchy">
          {roots.map((root) => <OrganizationBranch key={root.key} node={root} highlightedKey={highlightedNode?.key} profilePhoto={profilePhoto} isSelf={isSelf} />)}
        </ul>
      </div>
    </section>
  );
}
