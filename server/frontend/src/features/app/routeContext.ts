import { useOutletContext } from 'react-router-dom';
import type { Client, ManagedRepository } from '@pbcm/shared';

/**
 * The client of the route above, for every route below `/clients/:clientId`.
 * `ClientBoundary` has resolved it by then -- no route down here waits or checks again.
 */
export const useRouteClient = () => useOutletContext<Client>();

/** The same for the routes below `/repositories/:repoId`, resolved by `RepositoryBoundary`. */
export const useRouteRepository = () => useOutletContext<ManagedRepository>();
