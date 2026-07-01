"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Property } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

export default function DashboardPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  useEffect(() => {
    api.get<Property[]>("/properties").then(setProperties).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Reports land in the next build phase. For now, manage your properties.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your properties</CardTitle>
        </CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">No properties yet.</p>
              <Button asChild size="sm">
                <Link href="/properties">Create your first property</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {properties.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <Link href={`/properties/${p.id}`} className="flex items-center gap-2 text-sm hover:underline">
                    <Globe className="size-4 text-muted-foreground" />
                    {p.name}
                  </Link>
                  <span className="text-xs text-muted-foreground font-mono">{p.siteId}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
