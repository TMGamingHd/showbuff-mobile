import { Alert } from 'react-native';
import { dbToClient, listLabel } from './lists';

/**
 * Show standardized move prompt for 409 conflicts.
 * Params:
 * - movie: object with title/name
 * - existingList: string (db or client form)
 * - targetList: string (client form)
 * - onMove: async function to perform move
 */
export const showMoveDialog = ({ movie, existingList, targetList, onMove }) => {
  const existingClient = dbToClient(existingList);
  const title = 'Already in a list';
  const msg = `This movie is in your ${listLabel(existingClient)}. Move it to ${listLabel(targetList)}?`;
  Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Move',
      style: 'default',
      onPress: async () => {
        try {
          await onMove();
        } catch (e) {
          // Let caller handle errors via toast/alerts
        }
      },
    },
  ]);
};

export default { showMoveDialog };
