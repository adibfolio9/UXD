import { TaskItem } from '../types';

export interface GroundingSource {
  title: string;
  uri: string;
  domain: string;
}

export interface SearchGroundingResult {
  answer: string;
  sources: GroundingSource[];
  searchQueries: string[];
  model: string;
  groundedAt: string;
}

export type CandidateGroundingFocus = 'web_profile' | 'comp_benchmark' | 'custom';

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export async function searchCandidateGrounding(params: {
  task: TaskItem;
  focus: CandidateGroundingFocus;
  customQuestion?: string;
}): Promise<SearchGroundingResult> {
  const { task, focus, customQuestion } = params;
  return postJson<SearchGroundingResult>('/api/search-grounding/candidate', {
    focus,
    customQuestion,
    candidate: {
      fullName: task.fullName,
      email: task.email,
      portfolioUrl: task.portfolioUrl,
      currentLocation: task.currentLocation,
      yearsOfExperience: task.yearsOfExperience,
      designedAiProduct: task.designedAiProduct,
      noticePeriod: task.noticePeriod,
      expectedSalary: task.expectedSalary,
      readyToRelocateIn: task.readyToRelocateIn,
    },
  });
}

export async function searchMarketGrounding(params: {
  query: string;
  poolContext?: string;
}): Promise<SearchGroundingResult> {
  return postJson<SearchGroundingResult>('/api/search-grounding/market', params);
}
