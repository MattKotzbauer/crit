export interface Rule {
  id: string;
  text: string;
  section: string;
  enabled: boolean;
}

export interface RulesFile {
  sections: string[];
  rules: Rule[];
  raw: string;
}
