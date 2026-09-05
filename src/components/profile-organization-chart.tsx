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
  const node = (key: string) => organizationChart.find((item) => item.key === key)!;
  const mobileCard = (key: string) => (
    <OrganizationChartCard node={node(key)} highlighted={key === highlightedNode?.key} profilePhoto={profilePhoto} isSelf={isSelf} />
  );

  return (
    <section className="organization-chart-section" aria-labelledby="organization-chart-title">
      <header><h2 id="organization-chart-title">Organization chart</h2><p>Reporting structure at BSmile.</p></header>
      <div className="organization-chart-viewport">
        <ul className="organization-chart-tree" aria-label="BSmile organization hierarchy">
          {roots.map((root) => <OrganizationBranch key={root.key} node={root} highlightedKey={highlightedNode?.key} profilePhoto={profilePhoto} isSelf={isSelf} />)}
        </ul>
        <div className="organization-chart-mobile" aria-label="BSmile organization hierarchy">
          <div className="organization-chart-mobile-single">{mobileCard("director")}</div>
          <div className="organization-chart-mobile-link" aria-hidden="true" />
          <div className="organization-chart-mobile-single">{mobileCard("general-manager")}</div>
          <div className="organization-chart-mobile-branch organization-chart-mobile-branch-two">
            <div className="organization-chart-mobile-row organization-chart-mobile-row-two">
              <div className="organization-chart-mobile-report">{mobileCard("assistant-manager")}</div>
              <div className="organization-chart-mobile-report">{mobileCard("sales-coordinator")}</div>
            </div>
          </div>
          <div className="organization-chart-mobile-branch organization-chart-mobile-branch-three">
            <div className="organization-chart-mobile-row organization-chart-mobile-row-three">
              <div className="organization-chart-mobile-report">{mobileCard("psychologist")}</div>
              <div className="organization-chart-mobile-report">{mobileCard("admin")}</div>
              <div className="organization-chart-mobile-report">{mobileCard("intern")}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
